import type { Actor } from "@/lib/auth/authorize";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import type { MeasurementScope } from "@/lib/rank-measurements/types";
import type { SerpDepth } from "@/lib/serp/constants";
import type { z } from "zod";
import type { definitionSourceSchema, persistedPolicySchema, requestSchema } from "./schema";

export type DefinitionTransaction = Prisma.TransactionClient;
export type DefinitionDatabase = Pick<PrismaClient, "$transaction">;
export type DefinitionSource = z.infer<typeof definitionSourceSchema>;
export type PersistedDefinitionPolicy = z.infer<typeof persistedPolicySchema>;
export type FrozenWebRequest = z.infer<typeof requestSchema>;
export type DefinitionOwner = Readonly<{
  rankCheckId: string;
  executionKey: string;
  queuedTaskId: string | null;
}>;
export type DefinitionActorContext = Readonly<{ actor: Actor | null }>;
export type DefinitionBinding = Readonly<{
  id: string;
  projectId: string;
  keywordId: string;
  targetRevision: string;
  policyRevision: string;
  owner: DefinitionOwner;
  request: FrozenWebRequest;
  source: DefinitionSource;
  capturedAt: Date;
}>;
export type DefinitionHead = Readonly<{
  targetRevision: string;
  policyRevision: string;
  generation: string;
  sourceFingerprint: string;
  targetSource: DefinitionSource["target"];
  policySource: DefinitionSource["policy"];
  epochs: DefinitionSource["epochs"];
  capturedAt: Date;
}>;
export type DefinitionExecutionStage = "capture" | "dispatch";
/** Produced only by the trusted server ownership port after current native/run/schedule verification. */
export type VerifiedDefinitionExecution =
  | Readonly<{ kind: "user"; actorId: string }>
  | Readonly<{
      kind: "project_credential";
      actorId: null;
      projectId: string;
      runId: string;
      runItemId: string;
      credentialKind: "project_key";
      credentialId: string;
    }>
  | Readonly<{
      kind: "scheduler";
      actorId: null;
      runId: string;
      runItemId: string;
      scheduleId: string | null;
      scheduleEpoch: string | null;
    }>;
/** Server service functions, never request booleans or role strings. */
export type DefinitionAuditPort = (
  tx: DefinitionTransaction,
  event: Readonly<{
    actorId: string | null;
    projectId: string;
    keywordId: string | null;
    operation: "capture" | "configure";
    revisionId: string;
    previousRevisionId: string | null;
  }>,
) => Promise<void>;
export type DefinitionProducerPorts = Readonly<{
  recordMutation: DefinitionAuditPort;
  /** Renew actual current own native fence, run/item/task and schedule intent at each stage. */
  assertOwnExecution: (
    tx: DefinitionTransaction,
    owner: DefinitionOwner,
    input: Readonly<{ projectId: string; keywordId: string; providerId: string }>,
    stage: DefinitionExecutionStage,
  ) => Promise<VerifiedDefinitionExecution>;
  assertImplementedAdapter: (
    tx: DefinitionTransaction,
    source: DefinitionSource,
    providerId: string,
    request: FrozenWebRequest,
  ) => Promise<void>;
}>;
export type DefinitionFreshnessPorts = Readonly<{
  /** Actual host calendar/configuration, including DST/jitter; no frequency-to-fixed-day conversion. */
  cadenceIntervalMs: (
    tx: DefinitionTransaction,
    source: DefinitionSource,
    asOf: Date,
  ) => Promise<number | null>;
}>;
export type CurrentDefinitionMetadata = Readonly<{
  expectedScope: MeasurementScope | null;
  freshForMs: number | null;
  freshnessReason: "policy_unavailable" | "invalid_policy" | null;
}>;
export type CaptureDefinitionInput = Readonly<{
  projectId: string;
  keywordId: string;
  owner: DefinitionOwner;
  providerId: string;
  /** Only fetch depth may differ from canonical persisted policy; retained per execution. */
  requestedDepth?: SerpDepth;
}>;
