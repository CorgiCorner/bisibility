import "server-only";
import type { StoredSchedule } from "@/lib/actions/_schedule";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { KeywordCreateChange } from "@/lib/schemas/keyword-create-review";
import { resolveSerpDepth, type SerpDepth } from "@/lib/serp/constants";
import type { ScheduleStateCommand } from "./current-state";
import type { ScheduleCreateInput, ScheduleUpdateInput } from "./mutations";
import { aiUnitCents, providerForPolicy, type ReviewCadence, rankUnitCents } from "./review-cost";
import { loadCreateKeywords } from "./review-load-create-keywords";
import { loadKeywordCadence } from "./review-load-keyword-cadence";
import { loadKeywords } from "./review-load-keywords";
import {
  asCadence,
  idle,
  memberCount,
  pack,
  projectSerpProviderId,
  quote,
  rankRow,
} from "./review-load-shared";
import { loadAi, loadState } from "./review-load-state";
import { loadTransfer, type MarketReactivationChange } from "./review-load-transfers";
import type { ScheduleState } from "./types";

export type ScheduleChange =
  | MarketReactivationChange
  | KeywordCreateChange
  | { op: "create"; body: ScheduleCreateInput }
  | { op: "update"; id: string; body: ScheduleUpdateInput }
  | { op: "state"; id: string; command: ScheduleStateCommand; state: ScheduleState }
  | {
      op: "keyword-cadence";
      keywordIds: readonly string[];
      cadence: Omit<StoredSchedule, "nextCheckAt">;
      source: "schedule" | "frequency";
    }
  | { op: "keywords"; keywordIds: readonly string[]; scheduleId: string | null }
  | { op: "delete"; id: string };

export { scheduleRevision } from "./review-load-shared";

export async function loadScheduleSpend(
  projectId: string,
  change: ScheduleChange,
  now: Date,
  db: Prisma.TransactionClient = prisma,
) {
  if (change.op === "market-reactivate") return loadTransfer(db, projectId, change, now);
  if (
    change.op === "state" &&
    change.command.kind === "rank" &&
    change.state === "archived" &&
    !change.command.restore
  )
    return loadTransfer(
      db,
      projectId,
      { ...change, state: "archived", command: change.command },
      now,
    );
  if (change.op === "keywords-create") return loadCreateKeywords(db, projectId, change, now);
  const defaults = await db.projectDefaults.findUnique({
    select: { serpDepth: true, timezone: true },
    where: { projectId },
  });
  const projectDepth: SerpDepth = resolveSerpDepth(defaults?.serpDepth ?? undefined);
  const timezone = defaults?.timezone ?? "UTC";
  if (change.op === "create")
    return loadCreate(projectId, change.body, projectDepth, timezone, now, db);
  if (change.op === "keyword-cadence")
    return loadKeywordCadence(projectId, change, projectDepth, timezone, now, db);
  if (change.op === "keywords")
    return loadKeywords(
      projectId,
      change.keywordIds,
      change.scheduleId,
      projectDepth,
      timezone,
      now,
      db,
    );
  if (change.op === "state") return loadState(projectId, change, projectDepth, timezone, now, db);
  if (change.op === "delete") {
    const row = await rankRow(projectId, change.id, db);
    return pack(
      projectDepth,
      now,
      "delete",
      idle(),
      idle(),
      false,
      null,
      null,
      [change.id, row.measurementEpoch, row.updatedAt],
      { kind: "schedule", publicId: change.id },
    );
  }
  if (change.body.kind === "rank-membership") {
    return loadKeywords(
      projectId,
      change.body.membership.keywordIds,
      change.body.operation === "assign" ? change.body.membership.scheduleId : null,
      projectDepth,
      timezone,
      now,
      db,
    );
  }
  if (change.body.kind === "ai")
    return loadAi(projectId, change.id, change.body.input, projectDepth, now, db);
  if (change.body.kind === "data_sync") {
    return pack(projectDepth, now, "noop", idle(), idle(), false, null, null, [
      "data-sync",
      change.body.syncKind,
    ]);
  }
  return loadRankUpdate(projectId, change.id, change.body.input, projectDepth, timezone, now, db);
}

async function loadCreate(
  projectId: string,
  body: ScheduleCreateInput,
  projectDepth: SerpDepth,
  timezone: string,
  now: Date,
  db: Prisma.TransactionClient,
) {
  if (body.kind === "ai")
    return loadAiCreate(projectId, body.input, timezone, projectDepth, now, db);
  const cadence: ReviewCadence = {
    archived: false,
    cronExpression: body.input.cronExpression ?? null,
    enabled: true,
    frequency: body.input.frequency,
    jitterMinutes: body.input.jitterMinutes ?? 60,
    publicId: "rank-create",
    serpDepth: body.input.serpDepth ?? null,
    timeOfDay: body.input.timeOfDay ?? null,
    timezone: body.input.timezone ?? timezone,
  };
  const policy = body.input.providerPolicy ?? null;
  const projectProvider = await projectSerpProviderId(db, projectId);
  return pack(
    projectDepth,
    now,
    "create",
    idle(),
    quote(cadence, 0, rankUnitCents(projectDepth, providerForPolicy(policy, projectProvider))),
    false,
    policy,
    policy,
    ["rank-create"],
  );
}

async function loadAiCreate(
  projectId: string,
  input: Extract<ScheduleCreateInput, { kind: "ai" }>["input"],
  timezone: string,
  projectDepth: number,
  now: Date,
  db: Prisma.TransactionClient,
) {
  const promptIds = input.configuration.promptIds;
  const configurations = input.configuration.configurations;
  const prompts = promptIds.length
    ? await db.aiPrompt.findMany({
        select: { archivedAt: true, id: true, pausedAt: true },
        where: { OR: [{ id: { in: promptIds } }, { publicId: { in: promptIds } }], projectId },
      })
    : [];
  const active = prompts.filter((prompt) => !prompt.archivedAt && !prompt.pausedAt).length;
  const cadence: ReviewCadence = {
    archived: false,
    cronExpression: input.cron,
    enabled: input.enabled ?? false,
    frequency: "custom_cron",
    jitterMinutes: 0,
    publicId: "ai-create",
    serpDepth: null,
    timeOfDay: null,
    timezone: input.timezone || timezone,
  };
  return pack(
    projectDepth,
    now,
    "create",
    idle(),
    quote(cadence, active, aiUnitCents(configurations, now)),
    false,
    null,
    null,
    ["ai-create"],
  );
}

async function loadRankUpdate(
  projectId: string,
  id: string,
  input: Extract<ScheduleUpdateInput, { kind: "rank" }>["input"],
  projectDepth: number,
  timezone: string,
  now: Date,
  db: Prisma.TransactionClient,
) {
  const row = await rankRow(projectId, id, db);
  const members = await memberCount(projectId, id, db);
  const beforeCadence = asCadence(row, timezone);
  const afterCadence = asCadence(row, timezone, input);
  const beforePolicy = row.providerPolicy;
  const afterPolicy =
    input.providerPolicy === undefined ? row.providerPolicy : input.providerPolicy;
  const operation =
    input.enabled === false
      ? "pause"
      : sameCadence(beforeCadence, afterCadence) && beforePolicy === afterPolicy
        ? "noop"
        : "update";
  const depth = (cadence: ReviewCadence) => resolveSerpDepth(cadence.serpDepth ?? projectDepth);
  const projectProvider = await projectSerpProviderId(db, projectId);
  const unit = (cadence: ReviewCadence, policy: string | null) =>
    rankUnitCents(depth(cadence), providerForPolicy(policy, projectProvider));
  return pack(
    projectDepth,
    now,
    operation,
    quote(beforeCadence, members, unit(beforeCadence, beforePolicy)),
    quote(afterCadence, members, unit(afterCadence, afterPolicy)),
    false,
    beforePolicy,
    afterPolicy,
    [id, row.measurementEpoch, row.updatedAt],
    { kind: "schedule", publicId: id },
  );
}

function sameCadence(before: ReviewCadence, after: ReviewCadence) {
  return (
    before.archived === after.archived &&
    before.cronExpression === after.cronExpression &&
    before.enabled === after.enabled &&
    before.frequency === after.frequency &&
    before.jitterMinutes === after.jitterMinutes &&
    before.serpDepth === after.serpDepth &&
    before.timeOfDay === after.timeOfDay &&
    before.timezone === after.timezone
  );
}
