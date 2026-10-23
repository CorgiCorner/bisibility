import "server-only";
import { randomUUID } from "node:crypto";
import type { PaidCallPayment } from "@/lib/action-payment/paid-call";
import { ActionPaymentError } from "@/lib/action-payment/token";
import {
  BudgetExhaustedError,
  ProviderAllocationExhaustedError,
} from "@/lib/metering/admission-errors";
import type { RequestCostLimit } from "@/lib/provider-usage/request-cost-limit";
import type { ProviderCredential } from "@/lib/provider-usage/surface";
import type { ProviderRequestAttribution } from "@/lib/provider-usage/tag";
import { chargedProviderCostCents, ProviderCallError } from "@/lib/providers/call-error";
import { ProviderCostLimitError } from "@/lib/providers/cost-limit";
import { startDeploymentExecution } from "@/lib/providers/execution-extension";
import { consumeProviderLimit } from "@/lib/providers/rate-limit";
import { DataForSeoUnsupportedLocationError } from "@/lib/providers/serp/dataforseo";
import type { ProviderCredentials } from "@/lib/providers/types";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import { markProviderFailurePhase } from "./failure-phase";
import { ProviderLookupSignal } from "./lookup-failure";

/** Admission accepts only exact fixed-point values representable by its columns. */
export function deploymentEstimate(value: number, fractionDigits: 4 | 6): string {
  // Allow only floating-point representation noise from rate multiplication,
  // not a price or quantity that needs financial rounding to fit the column.
  const fixed = value.toFixed(fractionDigits);
  const normalized = Number(fixed);
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(value));
  const serialized = String(normalized);
  const pattern = fractionDigits === 4 ? /^\d{1,8}(?:\.\d{1,4})?$/ : /^\d{1,12}(?:\.\d{1,6})?$/;
  if (
    !Number.isFinite(value) ||
    normalized <= 0 ||
    Math.abs(value - normalized) > tolerance ||
    !pattern.test(serialized)
  ) {
    throw new RangeError("Deployment execution estimate is not an exact supported decimal.");
  }
  return serialized;
}

export async function runDeploymentPaidCall<T extends { costCents: number }>(input: {
  attribution: ProviderRequestAttribution;
  call: (credentials: ProviderCredentials, usage: ProviderRequestAttribution) => Promise<T>;
  onNotDispatched?: () => void;
  connectionId: string;
  credential?: ProviderCredential;
  estimatedCostCents: number;
  estimatedQuantity: number;
  provider: string;
  maxCostCents?: number;
  costLimit?: RequestCostLimit;
  payment?: PaidCallPayment;
}): Promise<T> {
  const operationKey = input.payment?.operationKey ?? randomUUID();
  const execution = await (async () => {
    try {
      return await startDeploymentExecution({
        attribution: input.attribution,
        connectionId: input.connectionId,
        credential: input.credential,
        estimatedCostCents: deploymentEstimate(input.estimatedCostCents, 4),
        estimatedQuantity: deploymentEstimate(input.estimatedQuantity, 6),
        operationKey,
        provider: input.provider,
        maxCostCents: input.maxCostCents,
        costLimit: input.payment?.costLimit ?? input.costLimit,
        beforeReserve: input.payment?.guard,
        aiResponse: input.payment?.aiResponse,
      }).catch((error: unknown) => {
        if (
          input.payment &&
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "operation_already_prepared"
        )
          throw new ActionPaymentError("payment_already_executed");
        throw error;
      });
    } catch (error) {
      throw markProviderFailurePhase(error, "before_dispatch");
    }
  })();
  if (execution == null) {
    throw new ProviderUsagePersistenceError({
      cause: new Error("Deployment execution unavailable."),
      phase: "admission",
    });
  }
  try {
    const gate = await consumeProviderLimit(input.provider, execution.credentials, {
      projectId: input.attribution.context.projectId,
    });
    if (!gate.success) {
      throw new ProviderLookupSignal({ ok: false, reason: "rate_limited", resetAt: gate.resetAt });
    }
    let result: T;
    try {
      result = await input.call(execution.credentials, input.attribution);
    } catch (caughtError) {
      let error = caughtError;
      if (
        !execution.started &&
        (error instanceof BudgetExhaustedError ||
          error instanceof ProviderAllocationExhaustedError ||
          error instanceof ProviderCostLimitError)
      )
        input.onNotDispatched?.();
      if (error instanceof ProviderUsagePersistenceError) throw error;
      error = execution.classifyFailure ? await execution.classifyFailure(error) : error;
      const measured = execution.costCents;
      if (execution.started && measured === null)
        throw new ProviderUsagePersistenceError({ cause: error });
      const unobservedCharge = execution.started ? null : chargedProviderCostCents(error);
      if (unobservedCharge !== null) throw new ProviderUsagePersistenceError({ cause: error });
      const cost = execution.started ? measured : null;
      if (error instanceof DataForSeoUnsupportedLocationError) {
        throw new ProviderLookupSignal({
          ...(cost == null ? {} : { costCents: cost }),
          ok: false,
          reason: "unsupported_location",
        });
      }
      if (error instanceof ProviderCallError && cost != null) {
        throw new ProviderCallError(error.message, cost, error.code);
      }
      throw error;
    }
    if (!execution.started || execution.costCents === null) {
      throw new ProviderUsagePersistenceError();
    }
    return { ...result, costCents: execution.costCents };
  } finally {
    try {
      await execution.finish();
    } finally {
      if (input.payment) await input.payment.record({ operationKey });
    }
  }
}
