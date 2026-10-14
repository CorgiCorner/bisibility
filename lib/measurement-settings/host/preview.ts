import "server-only";
import { prisma } from "@/lib/db/prisma";
import { definitionProjectScope } from "@/lib/measurement-definitions/access";
import {
  measurementSelectionSources,
  measurementSettingsImpact,
} from "@/lib/measurement-settings/selection-impact";
import type { MeasurementQuote, PreviewRequest } from "@/lib/measurement-settings/ui-contracts";
import { APP_REQUEST_ORIGIN } from "@/lib/provider-usage/surface";
import { previewRankCheckRun } from "@/lib/rank-check/runs/preview";
import type { SerpDepth } from "@/lib/serp/constants";
import type { SettingsHostContext } from "./contracts";
import { SettingsHostError } from "./errors";
import { settingsScheduleForecast } from "./forecast";
import { settingsIntentEffect } from "./intent-effect";
import { settingsManualEvidence } from "./manual";
import { settingsSnapshot } from "./projection";
import { signSettingsQuote } from "./quote-binding";
import { hostPreviewSchema } from "./schema";
import { assertSettingsSelection, settingsManualSpec } from "./selection";
import { loadSettingsSource } from "./source";

export function assertSettingsSnapshot(
  source: Awaited<ReturnType<typeof loadSettingsSource>>,
  request: { expectedSourceHash: string; expectedRevision: number },
) {
  if (
    source.sourceHash !== request.expectedSourceHash ||
    settingsSnapshot(source).revision !== request.expectedRevision
  )
    throw new SettingsHostError("settings_conflict");
}
export async function previewMeasurementSettingsHost(
  context: SettingsHostContext,
  input: PreviewRequest,
): Promise<MeasurementQuote> {
  const request = hostPreviewSchema.parse(input);
  const asOf = new Date(Math.floor(Date.now() / 1000) * 1000);
  const initial = await prisma.$transaction(
    async (tx) => {
      const source = await loadSettingsSource(tx, context, request.projectId, request.scheduleId);
      await definitionProjectScope(tx, context, request.projectId, "update", "keyword");
      assertSettingsSnapshot(source, request);
      const { geo } = assertSettingsSelection(source, request.selection);
      const project = await tx.project.findUniqueOrThrow({
        where: { id: source.project.id },
        select: { id: true, domain: true, isSample: true, publicId: true },
      });
      return { project, spec: settingsManualSpec(source, request.selection), geo };
    },
    { isolationLevel: "RepeatableRead" },
  );
  // Native preview is the actual current budget/selection/quote authority and performs no provider I/O.
  const run = await previewRankCheckRun({
    project: initial.project,
    spec: initial.spec,
    origin: APP_REQUEST_ORIGIN,
    trigger: "manual",
    providerId: request.selection.providerId,
    depth: request.selection.depth as SerpDepth,
  });
  return prisma.$transaction(
    async (tx) => {
      await definitionProjectScope(tx, context, request.projectId, "update", "keyword");
      const source = await loadSettingsSource(tx, context, request.projectId, request.scheduleId);
      assertSettingsSnapshot(source, request);
      const manual = await settingsManualEvidence(tx, source, request.selection, new Date());
      // Refuse a raced eligibility snapshot instead of signing a different executable target set.
      if (manual.targetIds.length !== run.targetCount)
        throw new SettingsHostError("settings_conflict");
      const forecast = await settingsScheduleForecast(
        tx,
        source,
        request.selection,
        request.schedule,
        asOf,
        new Date(),
      );
      const binding = {
        projectId: source.project.id,
        actorId: context.actor.id,
        providerId: request.selection.providerId,
        depth: request.selection.depth as SerpDepth,
        selection: { selection: request.selection, scheduleId: request.scheduleId },
        source: { sourceHash: source.sourceHash, manual, nativeToken: run.previewToken },
      };
      const measurement = signSettingsQuote("manual", binding, asOf);
      const schedule =
        forecast && request.schedule
          ? signSettingsQuote(
              "schedule",
              {
                ...binding,
                selection: {
                  selection: request.selection,
                  schedule: request.schedule,
                  scheduleId: request.scheduleId,
                },
                source: { sourceHash: source.sourceHash, forecast },
              },
              asOf,
            )
          : null;
      const intentSelection = {
        geoId: request.selection.geoId,
        languageCode: request.selection.languageCode,
        device: request.selection.device,
        depth: request.selection.depth,
      };
      // Defaults are future intent only; full source epochs invalidate all inherited-depth/scope previews.
      const intentEffect = settingsIntentEffect(source, intentSelection);
      const intent = signSettingsQuote(
        "intent",
        {
          projectId: source.project.id,
          actorId: context.actor.id,
          providerId: null,
          depth: request.selection.depth as SerpDepth,
          selection: { scheduleId: request.scheduleId, selection: intentSelection },
          source: { sourceHash: source.sourceHash, selection: intentSelection, intentEffect },
        },
        asOf,
      );
      const runView = {
        previewToken: run.previewToken,
        expiresAt: measurement.expiresAt < run.expiresAt ? measurement.expiresAt : run.expiresAt,
        selectionHash: run.selectionHash,
        keywordCount: run.keywordCount,
        targetCount: run.targetCount,
        executable: run.executable,
        matched: run.matched,
        budget: run.budget,
        overlapRunCount: run.overlapRunCount,
        excluded: run.excluded,
      };
      return {
        request,
        run: runView,
        measurementToken: measurement.token,
        schedulePreview: schedule,
        intentPreview: intent,
        capabilityVersion: request.selection.capabilityVersion,
        rateVersion: source.rateVersion ?? "unavailable",
        intentEffect,
        impact: measurementSettingsImpact(settingsSnapshot(source), request),
        manualEstimates: manual.estimates,
        calendar: forecast?.calendar ?? null,
        calendarReason: forecast && !forecast.calendar ? "scheduler_calendar_unavailable" : null,
        scope: {
          configured: {
            geoLabel: initial.geo.displayName,
            locationKind: initial.geo.kind,
            languageCode: request.selection.languageCode,
            device: request.selection.device,
            surface: request.selection.surface,
            depth: request.selection.depth,
          },
          effective: null,
          effectiveBasis: "unknown",
          observedAt: null,
          degradation: "scope_unknown",
          sources: measurementSelectionSources(settingsSnapshot(source), request.selection),
        },
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
