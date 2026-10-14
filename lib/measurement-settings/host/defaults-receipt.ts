import "server-only";
import { randomUUID } from "node:crypto";
import type { ProjectDefaults } from "@/lib/generated/prisma/client";
import { publicProjectDefaults } from "@/lib/settings/project-defaults-config";
import type { DefaultsRequest, DefaultsReview } from "@/lib/settings/reviewed-defaults-contract";
import { z } from "zod";
import type { SettingsHostTransaction } from "./contracts";
import type { DefaultsHostContext } from "./defaults-authority";
import { SettingsHostError } from "./errors";
import { settingsHash } from "./hash";

const valueSchema = z
  .object({
    projectId: z.string(),
    city: z.string().nullable(),
    country: z.string().nullable(),
    device: z.enum(["desktop", "mobile"]).nullable(),
    locationKey: z.string().nullable(),
    frequency: z.enum(["daily", "weekly", "monthly", "manual", "paused", "custom_cron"]),
    cronExpression: z.string().nullable(),
    timezone: z.string(),
    jitterMinutes: z.number().int(),
    serpDepth: z.number().int(),
    serpStopOnMatch: z.boolean(),
    inspectionDailyLimit: z.number().int(),
    searchSyncImportMonths: z.number().int().nullable(),
    searchSyncPace: z.string().nullable(),
  })
  .strict();
export const defaultsReceiptSchema = z
  .object({
    revision: z.string().regex(/^(0|[1-9]\d*)$/u),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
    value: valueSchema,
    market: z.object({
      city: z.string().nullable(),
      country: z.string(),
      device: z.enum(["desktop", "mobile"]),
      locationKey: z.string(),
      source: z.enum(["explicit", "derived", "fallback"]),
    }),
    timestamps: z.object({
      lastCheckedAt: z.string().datetime().nullable(),
      nextCheckAt: z.string().datetime().nullable(),
      updatedAt: z.string().datetime(),
    }),
  })
  .strict();
export function defaultsMutationScope(
  projectId: string,
  context: DefaultsHostContext,
  request: DefaultsRequest,
  review: DefaultsReview,
) {
  const { idempotencyKey, ...confirmation } = review;
  const actorScopeHash = settingsHash("defaults-mutation-actor", {
    actorId: context.actor.id,
    credential: context.credential ?? null,
    action: context.action ?? "settings.defaults.update",
  });
  const operation = "measurement_settings.defaults";
  return {
    projectId,
    operation,
    actorScopeHash,
    keyHash: settingsHash("defaults-mutation-key", {
      projectId,
      operation,
      actorScopeHash,
      idempotencyKey,
    }),
    bodyHash: settingsHash("defaults-mutation-body", { request, confirmation }),
  };
}
type Scope = ReturnType<typeof defaultsMutationScope>;
export async function readDefaultsReceipt(tx: SettingsHostTransaction, scope: Scope) {
  const row = await tx.measurementSettingsMutation.findUnique({
    where: {
      projectId_operation_keyHash: {
        projectId: scope.projectId,
        operation: scope.operation,
        keyHash: scope.keyHash,
      },
    },
  });
  if (!row) return null;
  if (row.bodyHash !== scope.bodyHash || row.actorScopeHash !== scope.actorScopeHash)
    throw new SettingsHostError("mutation_conflict");
  const result = defaultsReceiptSchema.parse(row.result);
  if (result.sourceHash !== row.resultSourceHash) throw new SettingsHostError("source_unavailable");
  return result;
}
export async function writeDefaultsReceipt(
  tx: SettingsHostTransaction,
  scope: Scope,
  context: DefaultsHostContext,
  previousSourceHash: string,
  sourceHash: string,
  revision: string,
  stored: ProjectDefaults,
  projectRef: string,
  market:
    | import("@/lib/serp/default-market").ProjectDefaultMarket
    | Omit<import("@/lib/serp/default-market").ProjectDefaultMarket, "displayName">,
) {
  const result = defaultsReceiptSchema.parse({
    sourceHash,
    revision,
    value: publicProjectDefaults(stored, projectRef),
    market,
    timestamps: {
      lastCheckedAt: stored.lastCheckedAt?.toISOString() ?? null,
      nextCheckAt: stored.nextCheckAt?.toISOString() ?? null,
      updatedAt: stored.updatedAt.toISOString(),
    },
  });
  await tx.measurementSettingsMutation.create({
    data: {
      ...scope,
      id: randomUUID(),
      actorId: context.auditActorId === undefined ? context.actor.id : context.auditActorId,
      previousSourceHash,
      resultSourceHash: sourceHash,
      result,
    },
  });
  return result;
}
