import { RUN_OUTCOMES, RUN_STATUSES, RUN_TRIGGERS } from "@/lib/rank-check/runs/contract";
import { z } from "zod";
import { type ProjectRunsQuery, parseProjectRunsQuery, projectRunsQuerySchema } from "./filters";

const isoDateTime = z.iso.datetime();
const nullableIsoDateTime = isoDateTime.nullable();

const projectSchema = z.object({ name: z.string(), publicId: z.string() }).strict();
const capabilitiesSchema = z
  .object({
    cancel: z.boolean(),
    pause: z.boolean(),
    resume: z.boolean(),
    retry: z.boolean(),
    viewDetails: z.boolean(),
  })
  .strict();
const attentionSchema = z
  .object({
    kind: z.enum(["blocked", "failed", "needs_reauthentication", "paused", "worker_unavailable"]),
    message: z.string().nullable(),
  })
  .strict()
  .nullable();
const scopeSchema = z.object({ description: z.string().nullable(), label: z.string() }).strict();

const projectRunBase = {
  attention: attentionSchema,
  capabilities: capabilitiesSchema,
  href: z.string(),
  lifecycle: z.enum([
    "planned",
    "blocked",
    "queued",
    "running",
    "cancelling",
    "waiting_for_first_data",
    "waiting_to_resume",
    "paused",
    "completed",
    "cancelled",
    "failed",
    "status_unavailable",
  ]),
  project: projectSchema,
  scope: scopeSchema,
  title: z.string(),
};

const rankCheckRunSchema = z
  .object({
    ...projectRunBase,
    details: z
      .object({
        costCents: z.number().int().nullable(),
        estimatedCostCents: z.number().int().nullable(),
        outcome: z.enum(RUN_OUTCOMES).nullable(),
        status: z.enum(RUN_STATUSES),
        trigger: z.enum(RUN_TRIGGERS),
      })
      .strict(),
    id: z.string(),
    kind: z.literal("rank_check"),
    progress: z
      .object({
        completed: z.number().int().nullable(),
        total: z.number().int().nullable(),
        unit: z.literal("targets"),
      })
      .strict(),
    timestamps: z
      .object({
        createdAt: isoDateTime,
        finishedAt: nullableIsoDateTime,
        launchedAt: nullableIsoDateTime,
        plannedFor: nullableIsoDateTime,
        startedAt: nullableIsoDateTime,
      })
      .strict(),
  })
  .strict();

const gscImportSchema = z
  .object({
    ...projectRunBase,
    details: z
      .object({
        pausedReason: z.enum(["error", "needs_reauth", "rate_limited", "user"]).nullable(),
        property: z.string(),
        source: z.literal("gsc"),
        state: z.string(),
      })
      .strict(),
    id: z.string(),
    kind: z.literal("gsc_import"),
    progress: z
      .object({
        completed: z.number().int().nullable(),
        total: z.number().int().nullable(),
        unit: z.literal("days"),
      })
      .strict(),
    timestamps: z
      .object({
        createdAt: isoDateTime,
        lastProbeAt: nullableIsoDateTime,
        lastSyncFinishedAt: nullableIsoDateTime,
        lastSyncStartedAt: nullableIsoDateTime,
        syncStartedAt: nullableIsoDateTime,
      })
      .strict(),
  })
  .strict();

export const projectRunResponseSchema = z.discriminatedUnion("kind", [
  rankCheckRunSchema,
  gscImportSchema,
]);

export const projectRunsApiResponseSchema = z
  .object({
    counts: z
      .object({
        rankChecks: z.number().int().nonnegative(),
        searchConsole: z.number().int().nonnegative(),
        total: z.number().int().nonnegative(),
      })
      .strict(),
    nextCursor: z.string().nullable(),
    runs: z.array(projectRunResponseSchema),
  })
  .strict();

export type ProjectRunsApiResponse = z.infer<typeof projectRunsApiResponseSchema>;

const projectRunsApiRequestSchema = z
  .object({
    cursor: z.string().optional(),
    limit: z.string().optional(),
    project: z.string().trim().min(1).max(120),
    source: z.string().optional(),
    status: z.string().optional(),
    view: z.string().optional(),
  })
  .strict();

export function parseProjectRunsApiRequest(url: URL): { project: string; query: ProjectRunsQuery } {
  const raw = projectRunsApiRequestSchema.parse(Object.fromEntries(url.searchParams));
  return {
    project: raw.project,
    query: projectRunsQuerySchema.parse(parseProjectRunsQuery(url.searchParams)),
  };
}
