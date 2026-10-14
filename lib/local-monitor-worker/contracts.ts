import { monitorLaunchSchema } from "@/lib/local-monitor-launch/contracts";
import { z } from "zod";
export const storedMonitorCommandSchema = monitorLaunchSchema.omit({ consentToken: true });
export type StoredMonitorCommand = z.infer<typeof storedMonitorCommandSchema>;
export const intentStateSchema = z.enum(["queued", "running", "blocked", "complete"]);
export const intentReasonSchema = z.enum([
  "expired",
  "access_revoked",
  "source_changed",
  "admission_refused",
  "provider_evidence_required",
  "interrupted_before_dispatch",
  "unavailable",
]);
export const jobSchema = z.object({
  id: z.string(),
  publicId: z.string(),
  projectId: z.string(),
  monitorId: z.string(),
  actorId: z.string().nullable(),
  command: storedMonitorCommandSchema,
  bodyHash: z.string(),
  keyHash: z.string(),
  connectionStamp: z.string(),
  consentDigest: z.string(),
  approvedAt: z.date(),
  expiresAt: z.date(),
  runId: z.string().nullable(),
  origin: z.enum(["manual", "scheduled"]).default("manual"),
  recurringApprovalId: z.string().nullable().default(null),
  recurringOccurrenceKey: z.string().nullable().default(null),
  pollIntervalMs: z.number().int().positive(),
  collectionDeadline: z.date(),
  state: intentStateSchema,
  reason: intentReasonSchema.nullable(),
  leaseToken: z.string().nullable(),
  leaseVersion: z.number().int().nonnegative(),
  leaseExpiresAt: z.date().nullable(),
  version: z.number().int().nonnegative(),
});
export type MonitorJob = z.infer<typeof jobSchema>;
export type MonitorWorkerClaim = Readonly<{ id: string; token: string; generation: number }>;
export type MonitorIntentView = Readonly<{
  id: string;
  state: MonitorJob["state"];
  reason: MonitorJob["reason"];
  expectedCount: number;
}>;
export type MonitorWorkflowProgress = Readonly<{
  state: "pending" | "blocked" | "complete";
  nextPollMs: number | null;
}>;
