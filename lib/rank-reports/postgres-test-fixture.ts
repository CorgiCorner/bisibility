import { makePublicId } from "@/lib/db/public-id";
import { frozenConfiguredScope } from "@/lib/measurement-definitions/canonical";
import { DefinitionUnavailableError } from "@/lib/measurement-definitions/errors";
import { definitionSourceFixture } from "@/lib/measurement-definitions/fixtures";
import type { DefinitionProducerPorts } from "@/lib/measurement-definitions/model";
import { configureDefinitionPolicy } from "@/lib/measurement-definitions/policy-config";
import { captureDefinitionBeforeIo } from "@/lib/measurement-definitions/producer";
import { personalViewDatabase } from "@/lib/saved-views/postgres-test-fixture";
import { resolvedLocation } from "@/lib/test/fixtures/location";
import type { RankReportContext } from "./access";
import { createReportCursorCodec } from "./cursor";
import type { RankReportTargetMetadata } from "./database";
import { reportAsOf, reportPolicy } from "./report-test-fixture";
import type { RankReportReadOptions } from "./service";

export async function rankReportTestDatabase(
  checkCount = 101,
  unknownManualFreshness = false,
  onQuery?: () => void,
) {
  if (!Number.isSafeInteger(checkCount) || checkCount < 1 || checkCount > 2000)
    throw new Error("Invalid owned fixture check count.");
  const fixture = await personalViewDatabase(undefined, onQuery);
  try {
    const db = fixture.db;
    const user = await db.user.create({
      data: { email: "reports@example.test", name: "Reports", publicId: makePublicId("usr") },
    });
    const writer = await db.user.create({
      data: {
        email: "report-writer@example.test",
        name: "Report writer",
        publicId: makePublicId("usr"),
      },
    });
    const project = await db.project.create({
      data: {
        domain: "example.test",
        name: "Reports",
        ownerId: writer.id,
        publicId: makePublicId("prj"),
      },
    });
    await db.membership.create({
      data: {
        projectId: project.id,
        userId: user.id,
        role: "viewer",
        publicId: makePublicId("mbr"),
      },
    });
    await db.membership.create({
      data: {
        projectId: project.id,
        userId: writer.id,
        role: "admin",
        publicId: makePublicId("mbr"),
      },
    });
    const context: RankReportContext = {
      actor: { id: user.id, memberships: [{ projectId: project.id, role: "viewer" }] },
      transport: "session",
    };
    // This synthetic host verifies actual check custody; it grants no provider I/O or finance authority.
    const host: DefinitionProducerPorts = {
      assertOwnExecution: async (tx, owner, input) => {
        const check = await tx.rankCheck.findFirst({
          where: {
            id: owner.rankCheckId,
            keywordId: input.keywordId,
            provider: input.providerId,
            keyword: { projectId: input.projectId },
          },
          select: { id: true },
        });
        if (!check || input.projectId !== project.id || owner.queuedTaskId !== null)
          throw new DefinitionUnavailableError();
        return { kind: "user" as const, actorId: writer.id };
      },
      assertImplementedAdapter: async (_tx, source, providerId) => {
        if (!source.policy.config?.adapters.some((adapter) => adapter.providerId === providerId))
          throw new DefinitionUnavailableError();
      },
      recordMutation: async (tx, event) => {
        await tx.auditLog.create({
          data: {
            publicId: makePublicId("audit"),
            action: "measurement_definition.fixture",
            actorId: event.actorId,
            projectId: event.projectId,
            targetId: project.publicId,
            targetType: "project",
            after: { operation: event.operation, revisionId: event.revisionId },
          },
        });
      },
    };
    const epoch = await fixture.client.query(
      'SELECT "measurementPolicyEpoch"::text AS epoch FROM public.projects WHERE id=$1',
      [project.id],
    );
    const config = definitionSourceFixture().policy.config;
    if (!config) throw new Error("Synthetic report policy fixture is unavailable.");
    if (unknownManualFreshness) config.freshness.manualTtlMs = null;
    await configureDefinitionPolicy(
      db,
      { actor: { id: writer.id } },
      { projectId: project.publicId, expectedPolicyEpoch: epoch.rows[0].epoch, config },
      host.recordMutation,
    );
    const location = await db.location.create({
      data: resolvedLocation({
        canonicalKey: "PL/Krakow",
        cityName: "Krakow",
        countryCode: "PL",
        displayName: "Krakow",
        gl: "pl",
        hl: "pl",
        id: "report-location",
        kind: "city",
        languageCode: "pl",
        languageLabel: "Polish",
        primaryGeoName: "Krakow",
        secondaryGeoName: "Poland",
      }),
    });
    const keyword = await db.keyword.create({
      data: {
        createdAt: new Date("2026-01-01T00:00:00Z"),
        device: "mobile",
        location: location.displayName,
        locationId: location.id,
        projectId: project.id,
        publicId: makePublicId("kw"),
        text: "Service",
      },
    });
    async function capturedCheck(
      target: { id: string },
      recordedAt: Date,
      position = 2,
      rankingUrl = "https://example.test/captured",
    ) {
      const check = await db.rankCheck.create({
        data: {
          createdAt: recordedAt,
          keywordId: target.id,
          provider: "synthetic",
          publicId: makePublicId("check"),
          requestedDepth: 100,
          status: "running",
          updatedAt: recordedAt,
        },
      });
      await db.$transaction(async (tx) => {
        const binding = await captureDefinitionBeforeIo(
          tx,
          {
            projectId: project.id,
            keywordId: target.id,
            providerId: check.provider,
            requestedDepth: 100,
            owner: {
              rankCheckId: check.id,
              executionKey: `fixture:${check.id}`,
              queuedTaskId: null,
            },
          },
          host,
        );
        const geo = frozenConfiguredScope(binding.source.target);
        await tx.rankCheck.update({
          where: { id: check.id },
          data: {
            checkedAt: new Date(recordedAt.getTime() + 1000),
            normalizationVersion: "v1",
            position,
            rankingUrl: rankingUrl,
            status: "completed",
            updatedAt: recordedAt,
          },
        });
        await tx.observationRun.create({
          data: {
            completeness: "complete",
            configuredScope: geo,
            createdAt: recordedAt,
            definitionBindingId: binding.id,
            effectiveScope: geo,
            engine: "google",
            executedAt: recordedAt,
            projectId: project.id,
            provider: binding.request.providerId,
            rankCheckId: check.id,
            requestPolicy: {
              depth: binding.request.depth,
              stopOnMatch: binding.request.stopOnMatch,
              findTargetsIn: binding.request.findTargetsIn,
              forcedAiOverview: binding.request.forcedAiOverview,
              evidence: {
                adapterVersion: binding.request.adapterVersion,
                completeThrough: { organic_result: 100 },
                observedAt: new Date(recordedAt.getTime() - 1000).toISOString(),
                policyRevision: binding.policyRevision,
                targetRevision: binding.targetRevision,
                version: 1,
              },
            },
            surface: "web_serp",
          },
        });
      });
      return check.id;
    }
    const checkIds: string[] = [];
    for (let index = 0; index < checkCount; index++) {
      const recordedAt = new Date(Date.UTC(2026, 9, 12, 10, 1, 0, index));
      checkIds.push(
        await capturedCheck(keyword, recordedAt, 2, `https://example.test/history-${index}`),
      );
    }
    return { ...fixture, capturedCheck, checkIds, context, keyword, project };
  } catch (error) {
    try {
      await fixture.close();
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], "Rank-report fixture setup and cleanup failed.");
    }
    throw error;
  }
}

export function rankReportTestOptions(): RankReportReadOptions {
  return {
    cursor: createReportCursorCodec("synthetic-report-fixture-signing-key-only"),
    firstAsOf: reportAsOf,
    limits: { maxChecks: 1000, maxItems: 1000, maxTargets: 1000 },
    loadMetadata: async () => new Map<string, RankReportTargetMetadata>(),
    policyAt: (asOf) => ({ ...reportPolicy(), asOf }),
  };
}
export function rankReportTestRequest(
  project: { publicId: string },
  keyword: { publicId: string },
) {
  return {
    pageLimit: 25,
    projectId: project.publicId,
    selectedIds: [keyword.publicId],
    stream: "observations",
    window: {
      basis: "recorded_at",
      from: "2026-10-01T00:00:00.000Z",
      to: reportAsOf.toISOString(),
    },
  };
}
