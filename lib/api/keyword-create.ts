import "server-only";

import { createKeywordBatchSet } from "@/lib/actions/keyword-helpers";
import { linkCheckSchedule } from "@/lib/actions/keyword-schedule-assignment";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { MarketArchivedError } from "@/lib/markets/archived";
import { ProjectMarketLimitExceededError } from "@/lib/markets/limits";
import { scheduleNotFound } from "@/lib/schedules/errors";
import {
  commitKeywordCreate,
  type KeywordCreateReview,
} from "@/lib/schedules/keyword-create-write";
import type { KeywordCreateChange } from "@/lib/schemas/keyword-create-review";
import { scheduleReviewSchema } from "@/lib/schemas/schedule-review";
import { denormalizedLocationLabel } from "@/lib/serp/location-label";
import { type ApiContext, forbidden, projectMatches } from "./context";
import { deferredKeywordLocations, resolveLocationForReview } from "./deferred-keyword-location";
import { ApiInputError } from "./errors";
import {
  prepareCreateCadenceReview,
  ScheduleReviewRequiredError,
  scheduleReviewResponse,
} from "./keyword-cadence-review";
import { assignCreatedKeywordCadences } from "./keyword-create-cadence";
import { parseKeywordCreateBody } from "./keyword-create-input";
import {
  type CreateMarket,
  createMarket,
  type KeywordCreateClient,
  type KeywordCreateTransaction,
  loadCreateDefaultMarket,
  locationInput,
  marketKey,
} from "./keyword-create-market";
import { assertSingleScheduleInput, scheduleFromCreate, scheduleSource } from "./keyword-utils";
import { KeywordLimitExceededError } from "./resource-limits";
import { keywordInclude, keywordResources } from "./resources";
import { errorResponse, resourceResponse } from "./responses";
import { apiScheduleReviewer, withApiScheduleAudit } from "./schedule-reviewer";

export const KEYWORD_CREATE_TRANSACTION_TIMEOUT_MS = 10_000;

function keywordCreateReviewSubmission(body: unknown) {
  if (!body || typeof body !== "object" || !("review" in body)) return undefined;
  return scheduleReviewSchema.optional().parse(body.review);
}

export async function keywordCreatePreviewChange(ctx: ApiContext, body: unknown) {
  return (await prepareKeywords(ctx.auth.project.id, body, prisma, true)).change;
}

async function prepareKeywords(
  projectId: string,
  body: unknown,
  client: KeywordCreateClient,
  forceDeferred: boolean,
) {
  const items = parseKeywordCreateBody(body);
  const selections = new Set(
    items.map((item) => item.schedule_id).filter((id) => id !== undefined),
  );
  if (
    selections.size > 1 ||
    (selections.size > 0 && items.some((item) => item.schedule_id === undefined))
  )
    throw new ApiInputError("Use one schedule_id per keyword create request.");
  const scheduleId = [...selections][0];
  for (const item of items) assertSingleScheduleInput(item);
  const defaultMarket = await loadCreateDefaultMarket(projectId, client);
  const warnings = new Set<string>();
  const preparedItems: Array<{
    item: (typeof items)[number];
    market: CreateMarket;
  }> = items.map((item) => {
    const market = createMarket(item, defaultMarket);
    return { item, market };
  });
  const uniqueMarkets = new Map(
    preparedItems.map(({ market }) => [marketKey(market), market] as const),
  );
  const deferLocations =
    forceDeferred ||
    scheduleId !== undefined ||
    items.some((item) => {
      const schedule = scheduleFromCreate(item);
      return schedule && schedule.frequency !== "manual" && schedule.frequency !== "paused";
    });
  const deferred = deferLocations ? deferredKeywordLocations(client) : null;
  const resolvedMarkets = new Map(
    await Promise.all(
      [...uniqueMarkets].map(
        async ([key, market]) =>
          [
            key,
            await resolveLocationForReview(locationInput(market, projectId), deferred),
          ] as const,
      ),
    ),
  );
  const resolvedItems = preparedItems.map(({ item, market }) => {
    const resolved = resolvedMarkets.get(marketKey(market));
    if (!resolved) throw new Error("Keyword location could not be resolved.");
    if (resolved.warning) warnings.add(resolved.warning);
    return { item, market, resolved };
  });

  const change: KeywordCreateChange = {
    op: "keywords-create",
    scheduleId: scheduleId ?? null,
    ...(scheduleId ? { allowPausedSchedule: true } : {}),
    cadence: null,
    keywords: resolvedItems.map(({ item, market, resolved }) => ({
      keyword: item.keyword,
      device: market.device,
      locationKey: resolved.location.canonicalKey,
      ...(scheduleId === undefined && (item.frequency || item.schedule)
        ? { cadence: scheduleFromCreate(item) }
        : {}),
    })),
  };
  return { change, deferred, resolvedItems, scheduleId, warnings };
}

export async function createKeywords(
  ctx: ApiContext,
  projectId: string,
  client: KeywordCreateClient = prisma,
) {
  if (!projectMatches(ctx.auth, projectId)) {
    return forbidden(ctx, "API key is not scoped to this project.");
  }

  const body = await ctx.req.json();
  const submission = keywordCreateReviewSubmission(body);
  const { change, deferred, resolvedItems, scheduleId, warnings } = await prepareKeywords(
    ctx.auth.project.id,
    body,
    client,
    Boolean(submission),
  );
  const reviewed = scheduleId !== undefined || Boolean(submission);
  if (reviewed && !("$transaction" in client))
    throw new ApiInputError("Reviewed keyword creation requires an API-owned transaction.");
  const review = reviewed
    ? undefined
    : await prepareCreateCadenceReview(client, ctx.auth.project.id, resolvedItems);
  if (review?.newKeywordRequiresReview) return scheduleReviewResponse(ctx);

  const persist = async (tx: KeywordCreateTransaction, admission?: KeywordCreateReview) => {
    await review?.assertExisting(tx);
    const target = scheduleId
      ? await tx.checkSchedule.findFirst({
          where: { projectId: ctx.auth.project.id, publicId: scheduleId, archivedAt: null },
        })
      : null;
    if (scheduleId && !target) throw scheduleNotFound();
    const locationIds = deferred ? await deferred.flush(tx) : new Map<string, string>();
    const persisted = await createKeywordBatchSet(
      tx,
      ctx.auth.project.id,
      resolvedItems.map(({ item, market, resolved }) => ({
        device: market.device,
        keyword: item.keyword,
        location: denormalizedLocationLabel(resolved.location),
        locationId: locationIds.get(resolved.location.id) ?? resolved.location.id,
        schedule: scheduleId === undefined ? scheduleFromCreate(item) : null,
        scheduleSource: scheduleSource(item),
        tags: item.tags,
        targetUrl: item.target_url ?? null,
        topic: item.topic ?? null,
        intent: item.intent ?? null,
      })),
    );
    await assignCreatedKeywordCadences(
      tx as Prisma.TransactionClient,
      ctx.auth.project.id,
      persisted.accepted,
      ctx.actorId ?? null,
      admission,
    );
    if (target) {
      await linkCheckSchedule(
        tx as Prisma.TransactionClient,
        ctx.auth.project.id,
        target,
        persisted.accepted
          .filter((row) => row.created || row.restored)
          .map(({ keyword }) => keyword),
        admission,
      );
    }
    const hydrated = await tx.keyword.findMany({
      include: keywordInclude,
      where: { id: { in: persisted.accepted.map(({ keyword }) => keyword.id) } },
    });
    const serialized = await keywordResources(hydrated, ctx.auth.project.publicId);
    const serializedById = new Map(
      hydrated.map((keyword, index) => [keyword.id, serialized[index]]),
    );
    const results = persisted.accepted.map(({ created, keyword }, index) => {
      const resource = serializedById.get(keyword.id);
      if (!resource) throw new Error("Keyword could not be created.");
      const warning = resolvedItems[index]?.resolved.warning;
      return {
        keyword: resource,
        status: created ? "created" : "skipped",
        ...(warning ? { warning } : {}),
      };
    });
    const createdCount = persisted.created.length;
    const skippedCount = persisted.accepted.length - createdCount;

    await writeAudit(
      {
        action: "keyword.batch_add",
        actorId: null,
        after: { created: createdCount, skipped: skippedCount },
        projectId: ctx.auth.project.id,
        targetId: ctx.auth.project.publicId,
        targetType: "project",
      },
      tx,
    );
    return { createdCount, results, skippedCount };
  };

  let persisted: Awaited<ReturnType<typeof persist>>;
  try {
    // Only this REST-owned transaction sets a budget; TransactionClient callers keep their outer one.
    persisted = reviewed
      ? await withApiScheduleAudit(ctx, () =>
          commitKeywordCreate(
            ctx.auth.project.id,
            apiScheduleReviewer(ctx),
            change,
            submission,
            persist,
            { strictReview: true },
          ),
        )
      : "$transaction" in client
        ? await client.$transaction((tx) => persist(tx), {
            timeout: KEYWORD_CREATE_TRANSACTION_TIMEOUT_MS,
          })
        : await persist(client);
  } catch (error) {
    if (error instanceof ScheduleReviewRequiredError) {
      if ("$transaction" in client) return scheduleReviewResponse(ctx);
      throw error;
    }
    if (error instanceof MarketArchivedError) {
      return errorResponse("conflict", error.message, 409, {
        headers: ctx.headers,
        instance: ctx.instance,
      });
    }
    if (
      !(error instanceof KeywordLimitExceededError) &&
      !(error instanceof ProjectMarketLimitExceededError)
    ) {
      throw error;
    }
    return errorResponse("forbidden", error.message, 403, {
      headers: ctx.headers,
      instance: ctx.instance,
    });
  }

  const warningList = [...warnings];
  const responseBody = {
    created: persisted.createdCount,
    results: persisted.results,
    skipped: persisted.skippedCount,
    ...(warningList.length > 0 ? { warnings: warningList } : {}),
  };
  return resourceResponse(responseBody, {
    headers: ctx.headers,
    status: persisted.createdCount > 0 ? 201 : 200,
  });
}
