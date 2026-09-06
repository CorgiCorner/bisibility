import { isPublicIdOfType } from "@/lib/db/public-id";
import { providerIdSchema } from "@/lib/schemas/provider";
import { z } from "zod";

export const RUN_TRIGGERS = ["manual", "scheduled", "api", "retry"] as const;
export const runTriggerSchema = z.enum(RUN_TRIGGERS);
export type RunTrigger = z.infer<typeof runTriggerSchema>;

export const SELECTION_KINDS = [
  "single",
  "selected",
  "filter",
  "all",
  "scheduled_due",
  "retry_failed",
  "rerun",
  "legacy_schedule",
] as const;
export const selectionKindSchema = z.enum(SELECTION_KINDS);
export type SelectionKind = z.infer<typeof selectionKindSchema>;

export const RUN_STATUSES = [
  "planned",
  "blocked",
  "queued",
  "running",
  "cancelling",
  "completed",
  "cancelled",
] as const;
export const runStatusSchema = z.enum(RUN_STATUSES);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const ACTIVE_RUN_STATUSES = ["queued", "running", "cancelling"] as const;

export const RUN_OUTCOMES = ["succeeded", "partial", "failed", "deferred"] as const;
export const runOutcomeSchema = z.enum(RUN_OUTCOMES);
export type RunOutcome = z.infer<typeof runOutcomeSchema>;

export const ITEM_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
  "deferred",
  "cancelled",
  "skipped",
  "blocked",
] as const;
export const itemStatusSchema = z.enum(ITEM_STATUSES);
export type ItemStatus = z.infer<typeof itemStatusSchema>;

export const SEND_UNCONFIRMED_REASON = "send_unconfirmed";

export const PARENT_RELATIONS = ["retry_failed", "retry_deferred", "rerun"] as const;
export const parentRelationSchema = z.enum(PARENT_RELATIONS);
export type ParentRelation = z.infer<typeof parentRelationSchema>;

export const TERMINAL_RUN_STATUSES = ["completed", "cancelled"] as const;
export const TERMINAL_ITEM_STATUSES = [
  "completed",
  "failed",
  "deferred",
  "cancelled",
  "skipped",
  "blocked",
] as const;

const nonNegativeIntegerSchema = z.number().int().nonnegative();

export const runCountsSchema = z.object({
  requested: nonNegativeIntegerSchema,
  total: nonNegativeIntegerSchema,
  skipped: nonNegativeIntegerSchema,
  completed: nonNegativeIntegerSchema,
  failed: nonNegativeIntegerSchema,
  deferred: nonNegativeIntegerSchema,
  cancelled: nonNegativeIntegerSchema,
});
export type RunCounts = z.infer<typeof runCountsSchema>;

const nullableIsoDatetimeSchema = z.iso.datetime().nullable();
const nullableRankCheckRunIdSchema = z
  .string()
  .refine((value) => Boolean(isPublicIdOfType(value, "rcr")))
  .nullable();

export const rankCheckProviderSchema = providerIdSchema.extract([
  "dataforseo",
  "serpapi",
  "local-sequence",
]);
export type RankCheckProvider = z.infer<typeof rankCheckProviderSchema>;

export const rankCheckOperationSchema = z.object({
  budget: z
    .object({
      capCents: z.number().int().nonnegative(),
      spentCents: z.number().int().nonnegative(),
    })
    .nullable()
    .optional(),
  kind: z.literal("rank_check"),
  id: z.string().startsWith("rcr_"),
  status: runStatusSchema,
  outcome: runOutcomeSchema.nullable(),
  trigger: runTriggerSchema,
  selectionKind: selectionKindSchema,
  counts: runCountsSchema,
  keywordCount: nonNegativeIntegerSchema,
  targetCount: nonNegativeIntegerSchema,
  startedTargets: nonNegativeIntegerSchema.optional(),
  hasRunningTargets: z.boolean().optional(),
  firstNotBefore: nullableIsoDatetimeSchema.optional(),
  scheduleTiming: z.string().nullable().optional(),
  provider: rankCheckProviderSchema.nullable().optional(),
  providerLabel: z.string().min(1).nullable().optional(),
  estimatedCostCents: z.number().int(),
  costCents: z.number().int(),
  blockedReason: z.string().nullable(),
  etaSeconds: nonNegativeIntegerSchema.nullable().optional(),
  plannedFor: nullableIsoDatetimeSchema,
  nextCheckAt: nullableIsoDatetimeSchema,
  snapshotAt: z.iso.datetime().optional(),
  startedAt: nullableIsoDatetimeSchema,
  finishedAt: nullableIsoDatetimeSchema,
  parentRunId: nullableRankCheckRunIdSchema,
});
export type RankCheckOperation = z.infer<typeof rankCheckOperationSchema>;

export const gscImportOperationSchema = z.object({
  kind: z.literal("gsc_import"),
  id: z.string(),
  state: z.string(),
  progress: z.object({
    done: nonNegativeIntegerSchema,
    total: nonNegativeIntegerSchema,
  }),
});
export type GscImportOperation = z.infer<typeof gscImportOperationSchema>;

export const operationSnapshotSchema = z.discriminatedUnion("kind", [
  rankCheckOperationSchema,
  gscImportOperationSchema,
]);
export type OperationSnapshot = z.infer<typeof operationSnapshotSchema>;
