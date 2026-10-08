import type { Prisma } from "@/lib/generated/prisma/client";
import type { ProviderCredential } from "@/lib/provider-usage/surface";
import type { ProviderRequestAttribution } from "@/lib/provider-usage/tag";
import type { ProviderCredentials } from "./types";
import type { ProviderUsageReceipt } from "./usage";

export type DeploymentExecutionInput = {
  attribution: ProviderRequestAttribution;
  connectionId: string;
  credential?: ProviderCredential;
  estimatedCostCents: string;
  estimatedQuantity: string;
  operationKey: string;
  provider: string;
  /** Persisted identity of a live rank check, verified by private admission. */
  rankCheckId?: string;
  keywordId?: string;
};

export type DeploymentRankReservationInput = {
  connectionId: string;
  projectId: string;
  source: string;
  /** Existing unwrapped running check whose reservation this quote replaces. */
  rankCheckId?: string;
  items: readonly {
    keywordId: string;
    estimatedCostCents: string;
    estimatedQuantity: string;
  }[];
};

export type DeploymentRankReservation = { prices: Record<string, string> };

export type DeploymentReservationClient = Prisma.TransactionClient;

export type DeploymentExecution = {
  credentials: ProviderCredentials;
  readonly started: boolean;
  readonly costCents: number | null;
  readonly quantity: number | null;
  finish(): Promise<void>;
};

/** Neutral queued transport boundary; private builds attach a durable credit session. */
export type QueuedDeploymentTask = {
  correlationId: string;
  keywordId: string;
  tag: string;
  /** Exact quote from the trusted transport's persisted task plan. */
  meteringEstimate?: { costCents: string; quantity: string };
};
export type QueuedDeploymentReceipt = {
  correlationId: string;
  costCents: number | null;
  failed: boolean;
  providerRequestId?: string;
};
export type QueuedDeploymentExecution = {
  credentials: ProviderCredentials;
  begin(tasks: readonly QueuedDeploymentTask[]): Promise<void>;
  transportStarted(): void | Promise<void>;
  record(receipts: readonly QueuedDeploymentReceipt[]): Promise<void>;
  abort(): Promise<void>;
  finish(): Promise<void>;
};
export type QueuedDeploymentRecovery = {
  credentials: ProviderCredentials;
  reconcile(): Promise<void>;
  bindReadyTask(taskId: string, tag: string, providerTaskId: string): Promise<void>;
  settleTask(taskId: string, receipt: ProviderUsageReceipt): Promise<number | null>;
  knownCost(taskId: string): Promise<number | null>;
  finish(): Promise<void>;
};
