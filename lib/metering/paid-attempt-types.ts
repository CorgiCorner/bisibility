import type { Prisma } from "@/lib/generated/prisma/client";
import type { SearchBudgetValuation } from "@/lib/provider-rates/search-budget-quote";
import type { ProviderRequestSurface } from "@/lib/provider-usage/surface";
import type {
  CorrectionInput,
  Lease,
  MeterReserveInput,
  Operation,
  Quantity,
  Receipt,
  ReserveResult,
  SettleInput,
} from "@usagekit/core";
import type { Clock } from "@usagekit/store";

/** Server-authored references only. Provider credentials and request content never enter this index. */
export type PaidAttemptContext = {
  /** Remaining customer-charge consent at this attempt's atomic admission. */
  maxCustomerCostCents?: string;
  projectId: string;
  connectionId: string;
  publicConnectionId: string;
  providerCredentialVersion: string;
  correlationId: string;
  /** Business reporting remains independent of the catalog operation identifier. */
  feature?: string;
  /** Exact content-free pricing inputs frozen before the provider dispatch. */
  requestPricing?: {
    version: 1;
    provider: string;
    operation: string;
    options: Readonly<Record<string, string>>;
    maxCostCents?: string;
    budgetValuation?: SearchBudgetValuation;
  };
  keywordId?: string;
  rankCheckId?: string;
  rankCheckRunId?: string;
  rankCheckRunItemId?: string;
  trigger?: string;
  tag?: string;
};
/** Frozen by the host's database price policy, independently of connection manual rates. */
export type PlatformPaidAttemptQuote = {
  estimate: readonly Quantity[];
  estimateSource: "measured" | "list";
  providerPriceVersion?: string;
  costOwner: string;
  creditAccountRef: string;
  customerPriceVersion: string;
  platformPools: readonly string[];
};
export type PaidAttemptInput = {
  reservation: MeterReserveInput;
  context: PaidAttemptContext;
  platformQuote?: PlatformPaidAttemptQuote;
};
export type PaidAttemptReservation = { operation: Operation; replayed: boolean };
export type PaidAttemptGrant = { operation: Operation; lease: Lease };
export type PaidAttemptOptions = {
  clock?: Clock;
  /** Platform implementations must validate retained account, wallet and credential custody. */
  verifyBinding?: (
    tx: Prisma.TransactionClient,
    input: MeterReserveInput,
    context: PaidAttemptContext,
  ) => Promise<void>;
  /** An idempotent debit and its acknowledgement execute inside this same caller transaction. */
  acknowledgeCharge?: (
    tx: Prisma.TransactionClient,
    operation: Operation,
    receipt: Receipt,
  ) => Promise<{ debitId: string; customerCents: Quantity; replayedCharge?: boolean }>;
};
export type PaidAttemptSettlement = SettleInput;
export type PaidAttemptCorrection = CorrectionInput;
export class PaidAttemptAdmissionError extends Error {
  constructor(
    public readonly outcome: ReserveResult,
    readonly context?: { surface: ProviderRequestSurface; connectionId: string; projectId: string },
  ) {
    super(`Paid attempt admission refused: ${outcome.outcome}`);
    this.name = "PaidAttemptAdmissionError";
  }
}
