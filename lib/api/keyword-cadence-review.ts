import type { StoredSchedule } from "@/lib/actions/_schedule";
import type { Prisma } from "@/lib/generated/prisma/client";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { ScheduleReviewRequiredError } from "@/lib/schedules/errors";
import { keywordCadenceRequiresReview } from "@/lib/schedules/review-decision-keywords";
import { projectSerpProviderId } from "@/lib/schedules/review-load-shared";
import { DEFAULT_SERP_DEPTH } from "@/lib/serp/constants";
import type { ApiContext } from "./context";
import { scheduleFromCreate } from "./keyword-utils";
import { errorResponse } from "./responses";
import type { ApiKeywordCreateItem } from "./schemas";

export { ScheduleReviewRequiredError } from "@/lib/schedules/errors";

export function scheduleReviewResponse(ctx: ApiContext) {
  return errorResponse("schedule_review_required", new ScheduleReviewRequiredError().message, 428, {
    headers: ctx.headers,
    instance: ctx.instance,
  });
}

export async function assertCadenceReviewNotRequired(
  tx: Prisma.TransactionClient,
  projectId: string,
  ids: readonly string[],
  target: StoredSchedule,
) {
  await lockProjectForProviderMutation(tx, projectId);
  const projectProvider = await projectSerpProviderId(tx, projectId);
  const defaults = await tx.projectDefaults.findUnique({
    where: { projectId },
    select: { serpDepth: true },
  });
  for (const id of new Set(ids)) {
    const keyword = await tx.keyword.findUnique({
      where: { id },
      select: {
        checkSchedule: {
          select: {
            archivedAt: true,
            enabled: true,
            frequency: true,
            cronExpression: true,
            providerPolicy: true,
            serpDepth: true,
          },
        },
      },
    });
    if (
      keyword &&
      keywordCadenceRequiresReview(
        keyword.checkSchedule,
        target,
        defaults?.serpDepth ?? DEFAULT_SERP_DEPTH,
        new Date(),
        projectProvider,
      )
    ) {
      throw new ScheduleReviewRequiredError();
    }
  }
}

type CreateReviewItem = {
  item: ApiKeywordCreateItem;
  market: { device: "desktop" | "mobile" };
  resolved: { location: { id: string } };
};
type CreateReviewClient = Pick<
  Prisma.TransactionClient,
  "keyword" | "$queryRaw" | "providerConnection"
>;

/** CREATE skips active duplicates and re-enrolls archived rows as new members. */
export function createCadenceJoins(existing: { archivedAt: Date | null } | null | undefined) {
  return !existing || Boolean(existing.archivedAt);
}

export async function prepareCreateCadenceReview(
  client: CreateReviewClient,
  projectId: string,
  items: readonly CreateReviewItem[],
) {
  // The batch creator accepts only the first occurrence of a keyword tuple.
  const rows = new Map<
    string,
    {
      text: string;
      locationId: string;
      device: "desktop" | "mobile";
      schedule: ReturnType<typeof scheduleFromCreate>;
    }
  >();
  for (const { item, market, resolved } of items) {
    const key = JSON.stringify([item.keyword, resolved.location.id, market.device]);
    if (!rows.has(key))
      rows.set(key, {
        text: item.keyword,
        locationId: resolved.location.id,
        device: market.device,
        schedule: scheduleFromCreate(item),
      });
  }
  const projectProvider = await projectSerpProviderId(client, projectId);
  const runnable = [...rows.values()].filter(
    (row) =>
      row.schedule &&
      keywordCadenceRequiresReview(
        null,
        row.schedule,
        DEFAULT_SERP_DEPTH,
        new Date(),
        projectProvider,
      ),
  );
  const findExisting = (db: CreateReviewClient, row: (typeof runnable)[number]) =>
    db.keyword.findUnique({
      where: {
        projectId_text_locationId_device: {
          projectId,
          text: row.text,
          locationId: row.locationId,
          device: row.device,
        },
      },
      select: {
        id: true,
        archivedAt: true,
        checkSchedule: {
          select: {
            archivedAt: true,
            enabled: true,
            frequency: true,
            cronExpression: true,
            providerPolicy: true,
            serpDepth: true,
          },
        },
      },
    });
  let newKeywordRequiresReview = false;
  for (const row of runnable) {
    if (!(await findExisting(client, row))) newKeywordRequiresReview = true;
  }
  return {
    newKeywordRequiresReview,
    async assertExisting(tx: CreateReviewClient) {
      if (!runnable.length) return;
      await lockProjectForProviderMutation(tx, projectId);
      for (const row of runnable) {
        const existing = await findExisting(tx, row);
        // Restore first clears membership, so re-enrollment is an increase.
        if (createCadenceJoins(existing)) throw new ScheduleReviewRequiredError();
      }
    },
  };
}
