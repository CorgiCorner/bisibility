import "server-only";
import type { SourceConfiguration } from "@/lib/ai-tracking/contract";
import { canonicalJson } from "@/lib/ai-tracking/identity";
import { publicTrackingSchedule } from "@/lib/ai-tracking/projections/public";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { resolveSerpDepth } from "@/lib/serp/constants";
import { readScheduleState } from "./current-state";
import { DataSyncStateError, ScheduleTransitionError, scheduleNotFound } from "./errors";
import { aiUnitCents, providerForPolicy, type ReviewCadence, rankUnitCents } from "./review-cost";
import type { ScheduleChange } from "./review-load";
import { loadLocal } from "./review-load-local";
import {
  asCadence,
  idle,
  memberCount,
  pack,
  projectSerpProviderId,
  quote,
  rankRow,
} from "./review-load-shared";

export async function loadAi(
  projectId: string,
  id: string,
  input: Partial<{
    configuration: { configurations?: SourceConfiguration[]; promptIds?: string[] };
    cron: string;
    enabled: boolean;
    timezone: string;
  }>,
  projectDepth: number,
  now: Date,
  db: Prisma.TransactionClient = prisma,
) {
  const row = await db.aiTrackingSchedule.findFirst({ where: { projectId, publicId: id } });
  if (!row) throw scheduleNotFound();
  const prompts = await db.aiPrompt.findMany({ where: { projectId } });
  const current = publicTrackingSchedule(row, prompts);
  const storedConfiguration = row.configuration as {
    configurations?: SourceConfiguration[];
    promptIds?: string[];
  };
  const nextConfiguration = input.configuration ?? storedConfiguration;
  const configurations = nextConfiguration.configurations ?? current.configuration.configurations;
  const beforePromptIds = new Set(storedConfiguration.promptIds ?? []);
  const internalByPublicId = new Map(prompts.map((prompt) => [prompt.publicId, prompt.id]));
  const afterPromptIds = new Set(
    (nextConfiguration.promptIds ?? [...beforePromptIds]).map(
      (id) => internalByPublicId.get(id) ?? id,
    ),
  );
  const activePrompts = prompts.filter((prompt) => !prompt.archivedAt && !prompt.pausedAt);
  const beforeActive = activePrompts.filter((prompt) => beforePromptIds.has(prompt.id)).length;
  const afterActive = activePrompts.filter(
    (prompt) => afterPromptIds.has(prompt.id) || afterPromptIds.has(prompt.publicId),
  ).length;
  const beforeCadence: ReviewCadence = {
    archived: Boolean(row.archivedAt),
    cronExpression: row.cron,
    enabled: row.enabled,
    frequency: "custom_cron",
    jitterMinutes: 0,
    publicId: row.publicId,
    serpDepth: null,
    timeOfDay: null,
    timezone: row.timezone,
  };
  const afterCadence: ReviewCadence = {
    ...beforeCadence,
    cronExpression: input.cron ?? row.cron,
    enabled: input.enabled ?? row.enabled,
    timezone: input.timezone ?? row.timezone,
  };
  const beforeRoute = routeKey(current.configuration.configurations);
  const afterRoute = routeKey(configurations);
  const unchanged =
    beforeCadence.cronExpression === afterCadence.cronExpression &&
    beforeCadence.enabled === afterCadence.enabled &&
    beforeCadence.timezone === afterCadence.timezone &&
    beforePromptIds.size === afterPromptIds.size &&
    [...beforePromptIds].every((id) => afterPromptIds.has(id)) &&
    beforeRoute === afterRoute &&
    configurationKey(current.configuration.configurations) === configurationKey(configurations);
  const operation =
    input.enabled === false && input.cron === undefined && input.configuration === undefined
      ? "pause"
      : unchanged
        ? "noop"
        : "update";
  return pack(
    projectDepth,
    now,
    operation,
    quote(beforeCadence, beforeActive, aiUnitCents(current.configuration.configurations, now)),
    quote(afterCadence, afterActive, aiUnitCents(configurations, now)),
    false,
    beforeRoute,
    afterRoute,
    [id, row.updatedAt],
    { kind: "ai", publicId: id },
  );
}

function routeKey(configurations: readonly SourceConfiguration[]) {
  return configurations
    .map((row) => [row.provider, row.source, row.engine, row.model ?? ""].join(":"))
    .sort()
    .join("|");
}

function configurationKey(configurations: readonly SourceConfiguration[]) {
  // Pricing sums configurations regardless of order, retaining duplicate charges.
  return canonicalJson(configurations.map(canonicalJson).sort());
}

export async function loadState(
  projectId: string,
  change: Extract<ScheduleChange, { op: "state" }>,
  projectDepth: number,
  timezone: string,
  now: Date,
  db: Prisma.TransactionClient = prisma,
) {
  if (change.command.kind === "local_monitor")
    return loadLocal(projectId, change, projectDepth, now, db);
  if (change.command.kind === "data_sync") {
    if (!change.command.publicWrite) {
      return pack(projectDepth, now, "noop", idle(), idle(), false, null, null, [
        change.id,
        change.state,
      ]);
    }
    if (change.state === "archived") throw new ScheduleTransitionError();
    if (change.command.syncKind === "search_console")
      throw new DataSyncStateError("search_console");
    const current = await readScheduleState(projectId, change.id, change.command, db);
    if (change.command.syncKind !== "domain_rating")
      return pack(projectDepth, now, "noop", idle(), idle(), false, null, null, [
        change.id,
        current.state,
        change.state,
      ]);
    const cadence: ReviewCadence = {
      archived: false,
      cronExpression: "0 * * * *",
      enabled: true,
      frequency: "custom_cron",
      jitterMinutes: 0,
      publicId: change.id,
      serpDepth: null,
      timeOfDay: null,
      timezone: "UTC",
    };
    const running = quote(cadence, 1, null);
    const before = current.state === "active" ? running : idle();
    const after = change.state === "active" ? running : idle();
    return pack(
      projectDepth,
      now,
      current.state === change.state ? "noop" : change.state === "paused" ? "pause" : "update",
      before,
      after,
      false,
      null,
      null,
      [change.id, current.state],
    );
  }
  if (change.command.kind === "ai") {
    const operation =
      change.command.restore || change.state === "paused"
        ? change.command.restore
          ? "restore"
          : "pause"
        : change.state === "archived"
          ? "archive"
          : "update";
    return loadAi(
      projectId,
      change.id,
      operation === "pause" || operation === "restore"
        ? { enabled: false }
        : { enabled: change.state === "active" },
      projectDepth,
      now,
      db,
    ).then((loaded) => ({
      ...loaded,
      spend: {
        ...loaded.spend,
        operation: operation === "update" ? loaded.spend.operation : operation,
      },
    }));
  }
  const row = await rankRow(projectId, change.id, db);
  const members = await memberCount(projectId, change.id, db);
  const beforeCadence = asCadence(row, timezone);
  const operation = change.command.restore
    ? "restore"
    : change.state === "archived"
      ? "archive"
      : change.state === "paused"
        ? "pause"
        : "update";
  const afterCadence = {
    ...beforeCadence,
    archived:
      change.state === "archived" ? true : beforeCadence.archived && !change.command.restore,
    enabled: operation === "update" ? change.state === "active" : false,
  };
  const projectProvider = await projectSerpProviderId(db, projectId);
  const unit = rankUnitCents(
    resolveSerpDepth(beforeCadence.serpDepth ?? projectDepth),
    providerForPolicy(row.providerPolicy, projectProvider),
  );
  return pack(
    projectDepth,
    now,
    operation,
    quote(beforeCadence, members, unit),
    quote(afterCadence, members, unit),
    false,
    row.providerPolicy,
    row.providerPolicy,
    [change.id, row.measurementEpoch, row.updatedAt],
    { kind: "schedule", publicId: change.id },
  );
}
