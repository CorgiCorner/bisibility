import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { nativeProviderCatalog } from "@/lib/provider-rates/catalog-source";
import type { NativePriceBinding } from "@/lib/provider-rates/native-price-samples";
import { loadNativeProviderQuote } from "@/lib/provider-rates/native-quote";
import { assertProviderCostLimit } from "@/lib/providers/cost-limit";
import {
  formatQuantity,
  type Meter,
  type MeterReserveInput,
  type ReserveResult,
} from "@usagekit/core";
import { PricedRequest, type ProviderRequest } from "@usagekit/providers";
import { reservePaidAttempts } from "./paid-admission";
import type { PaidAttemptContext, PaidAttemptInput } from "./paid-attempt-types";

type RequestInput = {
  reservation: MeterReserveInput;
  context: PaidAttemptContext;
  request: ProviderRequest;
  maxCostCents?: string;
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

async function quoteRequest(
  tx: Prisma.TransactionClient,
  original: RequestInput,
  matched: MeterReserveInput,
): Promise<PaidAttemptInput> {
  if (matched.estimateSource === "unknown")
    throw new Error("Provider request pricing inputs are unknown");
  const { scope } = matched;
  if (!scope.group || !scope.providerCredentialVersion || matched.fundingSource !== "byok")
    throw new Error("Request pricing requires an own-key project binding");
  const binding: NativePriceBinding = {
    namespace: scope.namespace,
    principal: scope.principal,
    projectId: scope.group,
    connectionId: scope.connection,
    provider: matched.provider,
    providerCredentialVersion: scope.providerCredentialVersion,
    fundingSource: "byok",
  };
  const options = matched.options ?? {};
  const feature = original.context.feature ?? original.reservation.operation;
  const plannedUnits = original.reservation.estimate?.find((q) => q.unit === "units");
  const quote = await loadNativeProviderQuote(
    tx,
    binding,
    feature,
    matched.operation,
    options,
    new Date(),
    plannedUnits ? Number(formatQuantity(plannedUnits)) : 1,
  );
  const budget = quote.quantities.find((q) => q.unit === "budget_cents");
  assertProviderCostLimit(
    budget ? [{ ...budget, unit: "cents" }] : quote.quantities,
    original.maxCostCents,
  );
  return {
    reservation: {
      ...matched,
      estimate: quote.quantities.some((q) => q.unit === "units")
        ? quote.quantities
        : [...quote.quantities, { unit: "units", value: 1n, scale: 0 }],
      estimateSource: quote.source,
      ...(quote.priceVersion ? { providerPriceVersion: quote.priceVersion } : {}),
    },
    context: {
      ...original.context,
      feature,
      requestPricing: {
        version: 1,
        provider: binding.provider,
        operation: matched.operation,
        options,
        ...(quote.budgetValuation ? { budgetValuation: quote.budgetValuation } : {}),
        ...(original.maxCostCents === undefined ? {} : { maxCostCents: original.maxCostCents }),
      },
    },
  };
}

/** Every snapshot waits for the same real atomic reservation; no provisional grants exist. */
export async function reserveOwnPricedRequests(
  tx: Prisma.TransactionClient,
  meter: Meter,
  inputs: readonly RequestInput[],
) {
  if (!inputs.length || inputs.length > 100) throw new RangeError("Invalid priced taskset");
  const slots = structuredClone(inputs).map((input) => ({
    input,
    quote: deferred<PaidAttemptInput>(),
    admission: deferred<ReserveResult>(),
  }));
  // Invalid requests never await admission, but still share the batch cancellation.
  for (const slot of slots) void slot.admission.promise.catch(() => undefined);
  const completed = Promise.allSettled(
    slots.map(async (slot) => {
      const {
        operation: _operation,
        options: _options,
        estimate: _estimate,
        estimateSource: _source,
        providerPriceVersion: _version,
        ...base
      } = slot.input.reservation;
      try {
        return await PricedRequest.price({
          catalog: nativeProviderCatalog,
          input: base,
          request: slot.input.request,
          rejectUnknown: true,
          meter: {
            ...meter,
            reserve: async (matched) => {
              slot.quote.resolve(await quoteRequest(tx, slot.input, matched));
              return slot.admission.promise;
            },
          },
        });
      } catch (error) {
        slot.quote.reject(error);
        throw error;
      }
    }),
  );
  try {
    const quotes = await Promise.all(slots.map((slot) => slot.quote.promise));
    const reservations = await reservePaidAttempts(tx, quotes);
    if (reservations.length !== slots.length)
      throw new Error("Incomplete priced taskset admission");
    for (const [index, result] of reservations.entries()) {
      slots[index]?.admission.resolve({
        outcome: "reserved",
        operation: result.operation,
        replayed: result.replayed,
        warnings: [],
        alerts: [],
      });
    }
    const priced = await completed;
    return priced.map((result, index) => {
      if (result.status === "rejected") throw result.reason;
      const reservation = reservations[index];
      if (!reservation) throw new Error("Request admission returned no operation");
      return { priced: result.value, reservation };
    });
  } catch (error) {
    for (const slot of slots) slot.admission.reject(error);
    await completed;
    throw error;
  }
}

/** Price the frozen wire request, then admit exactly once through the host's atomic guards. */
export async function reserveOwnPricedRequest(
  tx: Prisma.TransactionClient,
  meter: Meter,
  reservation: MeterReserveInput,
  context: PaidAttemptContext,
  request: ProviderRequest,
) {
  const [result] = await reserveOwnPricedRequests(tx, meter, [{ reservation, context, request }]);
  if (!result) throw new Error("Request was not admitted");
  return result;
}
