import type { Prisma } from "@/lib/generated/prisma/client";
import type { NativeRequestGuard } from "@/lib/metering/paid-attempt-types";
import type { RequestCostLimit } from "@/lib/provider-usage/request-cost-limit";
import type { PaymentAmount } from "./contract";

export type PaidCallPayment = {
  connectionId?: string;
  operationKey: string;
  snapshot: { credentialSource: "own" | "hosted"; credentialsEncrypted: string | null };
  guard: NativeRequestGuard;
  costLimit?: RequestCostLimit;
  record(input: { operationKey?: string; attemptIds?: readonly string[] }): Promise<void>;
};
export type DeploymentPaymentQuoteInput = {
  projectId: string;
  connectionId: string;
  provider: string;
  feature: string;
  operationKey: string;
  estimatedCostCents: string;
  quantity: string;
};
export type DeploymentPaymentQuote = { authority: string; amount: string };
export type DeploymentPaymentRead = {
  charge: string | null;
  providerCostCents: string | null;
  attempted: boolean;
};
export type PaymentPart = {
  charge: PaymentAmount;
  providerCost?: PaymentAmount;
  attempted: boolean;
};
export type PaymentDatabase = Prisma.TransactionClient;
