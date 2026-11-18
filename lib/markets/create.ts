import { prepareResourceCapacity } from "@/lib/capacity/capacity-extension";
import { inlineCron, inlineScheduleName } from "./create-schedule";
import "server-only";

import { scheduleForKeyword } from "@/lib/actions/_schedule";
import { writeAudit } from "@/lib/auth/audit";
import { makePublicId } from "@/lib/db/public-id";
import { ProjectMarketStatus } from "@/lib/generated/prisma/client";
import { normalizeResearchKeyword } from "@/lib/keyword-research/context";
import { refreshKeywordDispatchStates } from "@/lib/rank-check/dispatcher-state";
import { commitKeywordCreate } from "@/lib/schedules/keyword-create-write";
import { splitScheduleReview } from "@/lib/schemas/schedule-review";
import { denormalizedLocationLabel } from "@/lib/serp/location-label";
import { MarketArchivedError } from "./archived";
import { newMarketCreateSchema } from "./create-input";
import { MarketLocationError, resolveMarketLocation } from "./create-location";
import { marketCreateChange } from "./create-review-change";
import { termsForMarketCreate } from "./create-source";
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
export { MarketSourceError } from "./create-source";

export class MarketExistsError extends Error {
  readonly code = "market_exists";

  constructor() {
    super("This location is already tracked or has existing keywords in the project.");
    this.name = "MarketExistsError";
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
  const { body, review } = splitScheduleReview(input);
  const data = newMarketCreateSchema.parse(body);
  const resolved = await resolveMarketLocation(projectId, data);
  return commitKeywordCreate(
    projectId,
    { id: actorId, memberships: [] },
    marketCreateChange(data),
    review,
    async (tx) => {
      const capacity = await prepareResourceCapacity(tx, {
        projectId,
        dimensions: ["scheduledKeywords"],
      });
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
      const terms = await termsForMarketCreate(tx, projectId, data.method);
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
      if (schedule)
        await prepareResourceCapacity(tx, {
          projectId,
          dimensions: [],
          cadence: {
            dimension: "scheduleFrequencies",
            after: schedule,
          },
        });
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
      await capacity.check();
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
  );
}
