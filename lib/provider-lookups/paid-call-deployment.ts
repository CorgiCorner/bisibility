import "server-only";

import { randomUUID } from "node:crypto";
import {
  beginHostedExecution,
  type HostedMeteringObservation,
  recordHostedExecution,
} from "@/lib/metering/hosted-sync";
import type { ProviderCredential } from "@/lib/provider-usage/surface";
import type { ProviderRequestAttribution } from "@/lib/provider-usage/tag";
import { chargedProviderCostCents, ProviderCallError } from "@/lib/providers/call-error";
import { startDeploymentExecution } from "@/lib/providers/execution-extension";
import { consumeProviderLimit } from "@/lib/providers/rate-limit";
import { DataForSeoUnsupportedLocationError } from "@/lib/providers/serp/dataforseo";
import type { ProviderCredentials } from "@/lib/providers/types";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
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
  connectionId: string;
  credential?: ProviderCredential;
  estimatedCostCents: number;
  estimatedQuantity: number;
  provider: string;
}): Promise<T> {
  const operationKey = randomUUID();
  const execution = await startDeploymentExecution({
    attribution: input.attribution,
    connectionId: input.connectionId,
    credential: input.credential,
    estimatedCostCents: deploymentEstimate(input.estimatedCostCents, 4),
    estimatedQuantity: deploymentEstimate(input.estimatedQuantity, 6),
    operationKey,
    provider: input.provider,
  });
  if (execution == null) {
    throw new ProviderUsagePersistenceError({
      cause: new Error("Deployment execution unavailable."),
    });
  }
  const observation: HostedMeteringObservation = {
    operationKey,
    projectId: input.attribution.context.projectId,
    connectionId: input.connectionId,
    provider: input.provider,
    feature: input.attribution.context.feature,
    source: input.attribution.context.source,
    credential: input.credential,
    correlationId: input.attribution.context.correlationId,
  };
  // Shadow observation only; the hosted credit ledger remains authoritative.
  await beginHostedExecution(observation, {
    cents: deploymentEstimate(input.estimatedCostCents, 4),
    units: deploymentEstimate(input.estimatedQuantity, 6),
  });
  let providerFailed = false;
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
    } catch (error) {
      providerFailed = true;
      if (error instanceof ProviderUsagePersistenceError) throw error;
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
    await execution.finish();
    if (execution.started) {
      await recordHostedExecution(observation, {
        costCents: execution.costCents,
        usageQuantity: execution.quantity,
        failed: providerFailed,
      });
    }
  }
}
