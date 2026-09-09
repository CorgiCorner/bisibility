import "server-only";

import { scheduleForKeyword } from "@/lib/actions/_schedule";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { ProjectMarketStatus } from "@/lib/generated/prisma/client";
import { normalizeResearchKeyword } from "@/lib/keyword-research/context";
import { refreshKeywordDispatchStates } from "@/lib/rank-check/dispatcher-state";
import { denormalizedLocationLabel } from "@/lib/serp/location-label";
import { MarketArchivedError } from "./archived";
import {
  type MarketPasteRow,
  type NewMarketCreateInput,
  newMarketCreateSchema,
  parseNewMarketPaste,
} from "./create-input";
import { MarketLocationError, resolveMarketLocation } from "./create-location";
import { MAX_PROJECT_MARKETS, ProjectMarketLimitExceededError } from "./limits";

export type {
  MarketLocationKind,
  NewMarketCreateInput,
  NewMarketCreateResult,
} from "./create-input";
export {
  MarketPasteValidationError,
  marketLocationKinds,
  newMarketCreateSchema,
  parseNewMarketPaste,
} from "./create-input";
export { MarketLocationError } from "./create-location";

export class MarketExistsError extends Error {
  readonly code = "market_exists";

  constructor() {
    super("This location is already tracked or has existing keywords in the project.");
    this.name = "MarketExistsError";
  }
}

export class MarketSourceError extends Error {
  readonly code = "market_source_invalid";

  constructor() {
    super("The source market is no longer available to copy.");
    this.name = "MarketSourceError";
  }
}

export class MarketScheduleError extends Error {
  readonly code = "market_schedule_invalid";

  constructor() {
    super("Choose a current schedule for this project.");
    this.name = "MarketScheduleError";
  }
}

type CreateHooks = { afterKeywordInsert?: () => void; afterMarketInsert?: () => void };

function inlineScheduleName(
  input: Extract<NonNullable<NewMarketCreateInput["schedule"]>, { kind: "inline" }>,
) {
  return (
    input.name ||
    `${input.frequency[0].toUpperCase()}${input.frequency.slice(1)} ${input.timeOfDay ?? "06:00"}`
  );
}

function inlineCron(
  input: Extract<NonNullable<NewMarketCreateInput["schedule"]>, { kind: "inline" }>,
) {
  const hour = Number((input.timeOfDay ?? "06:00").slice(0, 2));
  if (input.frequency === "weekly") return `0 ${hour} * * 1`;
  if (input.frequency === "monthly") return `0 ${hour} 1 * *`;
  return null;
}

async function termsForCreate(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  projectId: string,
  method: NewMarketCreateInput["method"],
) {
  if (method.kind === "empty") return [];
  if (method.kind === "paste") return parseNewMarketPaste(method.text);
  const source = await tx.projectMarket.findFirst({
    include: { location: { select: { canonicalKey: true } } },
    where: { projectId, publicId: method.sourceMarketId, status: ProjectMarketStatus.active },
  });
  if (!source) throw new MarketSourceError();
  const keywords = await tx.keyword.findMany({
    select: { text: true },
    where: { archivedAt: null, locationId: source.locationId, projectId },
  });
  const unique = new Map<string, MarketPasteRow>();
  for (const keyword of keywords)
    unique.set(normalizeResearchKeyword(keyword.text), { targetUrl: null, text: keyword.text });
  return [...unique.values()];
}

/**
 * `projectId` is the project's internal id, resolved by the caller's authorization step; the
 * public `prj_` id inside `input` only names the project the caller was authorized for.
 */
export async function createProjectMarket(
  actorId: string,
  projectId: string,
  input: unknown,
  hooks: CreateHooks = {},
) {
  const data = newMarketCreateSchema.parse(input);
  const resolved = await resolveMarketLocation(projectId, data);
  return prisma.$transaction(
    async (tx) => {
      const location = await tx.location.findUnique({
        select: {
          canonicalKey: true,
          countryCode: true,
          displayName: true,
          id: true,
          kind: true,
          languageCode: true,
          languageLabel: true,
        },
        where: { id: resolved.id },
      });
      if (
        !location ||
        location.countryCode !== data.countryCode ||
        location.languageCode !== data.languageCode ||
        location.kind !== data.kind
      ) {
        throw new MarketLocationError();
      }
      const existing = await tx.projectMarket.findUnique({
        include: { location: { select: { canonicalKey: true } } },
        where: { projectId_locationId: { locationId: location.id, projectId } },
      });
      if (existing?.status === ProjectMarketStatus.removed)
        throw new MarketArchivedError(existing.location.canonicalKey);
      if (existing) throw new MarketExistsError();
      const visibleCount = await tx.projectMarket.count({
        where: {
          projectId,
          status: { in: [ProjectMarketStatus.active, ProjectMarketStatus.paused] },
        },
      });
      if (visibleCount >= MAX_PROJECT_MARKETS)
        throw new ProjectMarketLimitExceededError(MAX_PROJECT_MARKETS);
      const terms = await termsForCreate(tx, projectId, data.method);
      const existingKeywords = await tx.keyword.findMany({
        select: { text: true },
        where: { locationId: location.id, projectId },
      });
      if (data.method.kind === "empty" && existingKeywords.length > 0) {
        throw new MarketExistsError();
      }
      const existingTerms = new Set(
        existingKeywords.map((keyword) => normalizeResearchKeyword(keyword.text)),
      );
      if (terms.some((term) => existingTerms.has(normalizeResearchKeyword(term.text)))) {
        throw new MarketExistsError();
      }
      const selectedSchedule = data.schedule?.kind === "manual" ? null : data.schedule;
      const schedule = selectedSchedule
        ? selectedSchedule.kind === "existing"
          ? await tx.checkSchedule.findFirst({
              where: {
                archivedAt: null,
                enabled: true,
                projectId,
                publicId: selectedSchedule.scheduleId,
              },
            })
          : await tx.checkSchedule.create({
              data: {
                cronExpression: inlineCron(selectedSchedule),
                enabled: true,
                frequency: selectedSchedule.frequency,
                isDefault: false,
                jitterMinutes: 60,
                name: inlineScheduleName(selectedSchedule),
                projectId,
                publicId: makePublicId("sch"),
                timeOfDay: selectedSchedule.timeOfDay ?? "06:00",
                timezone: null,
              },
            })
        : null;
      if (selectedSchedule && !schedule) throw new MarketScheduleError();
      const market = await tx.projectMarket.create({
        data: {
          futureKeywordDevices: data.devices,
          locationId: location.id,
          name: data.name || location.displayName,
          publicId: makePublicId("pmkt"),
          projectId,
          status: ProjectMarketStatus.active,
        },
      });
      hooks.afterMarketInsert?.();
      const rows = terms.flatMap((term) =>
        data.devices.map((device) => ({
          device,
          location: denormalizedLocationLabel(location),
          locationId: location.id,
          projectId,
          publicId: makePublicId("kw"),
          targetUrl: term.targetUrl,
          text: term.text,
        })),
      );
      if (rows.length > 0) await tx.keyword.createMany({ data: rows });
      hooks.afterKeywordInsert?.();
      const keywords =
        rows.length > 0
          ? await tx.keyword.findMany({
              select: { id: true },
              where: { publicId: { in: rows.map((row) => row.publicId) } },
            })
          : [];
      if (schedule && keywords.length > 0) {
        await tx.keyword.updateMany({
          data: { checkScheduleId: schedule.id },
          where: { id: { in: keywords.map((keyword) => keyword.id) } },
        });
        const timezone = schedule.timezone ?? "UTC";
        await tx.keywordSchedule.createMany({
          data: keywords.map((keyword) => ({
            ...scheduleForKeyword(
              {
                cronExpression: schedule.cronExpression,
                frequency: schedule.frequency,
                jitterMinutes: schedule.jitterMinutes,
                nextCheckAt: null,
                serpDepth: schedule.serpDepth as 10 | 20 | 50 | 100 | null,
                timezone,
              },
              keyword.id,
            ),
            keywordId: keyword.id,
          })),
        });
      }
      if (data.schedule?.kind === "manual" && keywords.length > 0) {
        // An explicit cadence prevents inherited project defaults from scheduling these keywords.
        await tx.keywordSchedule.createMany({
          data: keywords.map((keyword) => ({
            keywordId: keyword.id,
            frequency: "manual",
            cronExpression: null,
            nextCheckAt: null,
            timezone: "UTC",
          })),
        });
      }
      if (keywords.length > 0) {
        await refreshKeywordDispatchStates(
          { keywordIds: keywords.map((keyword) => keyword.id) },
          tx,
        );
      }
      if (data.schedule?.kind === "inline" && schedule) {
        await writeAudit(
          {
            action: "check_schedule.create",
            actorId,
            after: {
              frequency: schedule.frequency,
              name: schedule.name,
              publicId: schedule.publicId,
            },
            projectId,
            targetId: schedule.publicId,
            targetType: "check_schedule",
          },
          tx,
        );
      }
      await writeAudit(
        {
          action: "project_market.create",
          actorId,
          after: {
            keywordCount: rows.length,
            method: data.method.kind,
            scheduleId: schedule?.publicId ?? null,
          },
          projectId,
          targetId: market.publicId,
          targetType: "project_market",
        },
        tx,
      );
      return {
        canonicalKey: location.canonicalKey,
        countryCode: location.countryCode,
        displayName: location.displayName,
        keywordCount: rows.length,
        kind: location.kind,
        languageCode: location.languageCode,
        languageLabel: location.languageLabel,
        publicId: market.publicId,
      };
    },
    { isolationLevel: "Serializable" },
  );
}
