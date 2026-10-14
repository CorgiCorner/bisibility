import type { Actor } from "@/lib/auth/authorize";
import type { AuditRequestContext } from "@/lib/auth/request-context";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import type { LocalCapability } from "@/lib/local-monitoring/capability";
import type { LocalSubmitCollectAdapter } from "@/lib/local-monitoring/execution-types";
import type { LocalQuote } from "@/lib/local-monitoring/quote";
import type { ExecutionTargetV1 } from "@/lib/local-monitoring/types";
import type { ByokEvidenceInput } from "@/lib/provider-usage/byok-evidence";
import type { RetainedProjectReadAuthority } from "@/lib/rank-history/retained-read-authority";
import type { PricedRequest } from "@usagekit/providers";

export type LocalStoreContext = Readonly<{
  actor: Actor | null;
  requestContext?: AuditRequestContext;
  readAuthority?: RetainedProjectReadAuthority;
}>;
export type LocalTransaction = Prisma.TransactionClient;
export type LocalDatabase = PrismaClient;
export type LocalKeywordSnapshot = Readonly<{
  id: string;
  text: string;
  device: "desktop" | "mobile";
  locationId: string;
  measurementTargetEpoch: bigint;
  measurementPolicyEpoch: bigint;
  updatedAt: Date;
}>;
export type LocalTargetOptions = Pick<
  ExecutionTargetV1,
  | "engine"
  | "surface"
  | "resultKind"
  | "rankScale"
  | "language"
  | "device"
  | "operatingSystem"
  | "cutoff"
  | "zoom"
>;

/** Root implements persisted revision/policy authority; caller strings are never authority. */
export interface LocalPolicyPort {
  capture(
    tx: LocalTransaction,
    input: {
      projectId: string;
      keyword: LocalKeywordSnapshot;
      options: LocalTargetOptions;
    },
  ): Promise<{ keywordRevision: string; policyRevision: string }>;
  assertCurrent(
    tx: LocalTransaction,
    input: {
      projectId: string;
      keyword: LocalKeywordSnapshot;
      target: ExecutionTargetV1;
    },
  ): Promise<void>;
}
export type LocalCustodyBinding = Omit<ByokEvidenceInput, "keywordId"> & {
  credentialVersion: string;
  maxCostCents?: string;
};
/** These ports have no permissive/default implementation. Root owns activation and signed consent. */
export interface LocalActivationPort {
  assertRegistered(tx: LocalTransaction, capability: LocalCapability): Promise<void>;
  verifyConsent(
    tx: LocalTransaction,
    input: {
      actorId: string;
      projectId: string;
      connectionPublicId: string;
      quote: LocalQuote;
      targets: readonly ExecutionTargetV1[];
      operations: readonly { targetKey: string; operationKey: string }[];
      now: Date;
    },
  ): Promise<readonly { targetKey: string; binding: LocalCustodyBinding }[]>;
  assertPreparedTaskset(
    tx: LocalTransaction,
    input: { quote: LocalQuote; requests: readonly PricedRequest[] },
  ): Promise<void>;
}
export type LocalHostPorts = Readonly<{
  policy: LocalPolicyPort;
  activation: LocalActivationPort;
  adapter: LocalSubmitCollectAdapter;
  clock: () => Date;
}>;

/** A server-owned monitor link joins the existing run/Meter transaction; never a client field. */
export interface LocalRunBinding {
  verify(tx: LocalTransaction, scope: import("./access").LocalProjectScope): Promise<void>;
  replay(
    tx: LocalTransaction,
    scope: import("./access").LocalProjectScope,
    run: { id: string; publicId: string; projectId: string },
  ): Promise<void>;
  created(
    tx: LocalTransaction,
    scope: import("./access").LocalProjectScope,
    run: { id: string; publicId: string; projectId: string },
  ): Promise<void>;
}
