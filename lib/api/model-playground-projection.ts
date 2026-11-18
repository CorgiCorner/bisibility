import {
  estimatedMoney,
  publicCostEvidenceSchema,
  publicProviderCostSchema,
  reportedMoney,
  unknownMoney,
} from "./model-playground-public-cost";

const canonicalDecimal = (value: string | null) =>
  value?.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
type ResultProviderCost = { amount: string | null; certainty: string; currency: string };
type ReceiptProviderCost = { certainty: string; unit: { code: string }; value: string | null };
export function providerCostsAgree(
  resultCost: ResultProviderCost,
  receiptCost: ReceiptProviderCost,
) {
  const certaintyAgrees =
    resultCost.certainty === "reported"
      ? receiptCost.certainty === "measured" || receiptCost.certainty === "free"
      : resultCost.certainty === "unknown" && receiptCost.certainty === "unknown";
  return (
    certaintyAgrees &&
    canonicalDecimal(resultCost.amount) === canonicalDecimal(receiptCost.value) &&
    resultCost.currency === receiptCost.unit.code
  );
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
function agreeableResult(cost: unknown): ResultProviderCost | null {
  if (!isRecord(cost) || typeof cost.certainty !== "string" || typeof cost.currency !== "string")
    return null;
  if (cost.amount !== null && typeof cost.amount !== "string") return null;
  return {
    amount: cost.amount as string | null,
    certainty: cost.certainty,
    currency: cost.currency,
  };
}
function agreeableReceipt(cost: unknown): ReceiptProviderCost | null {
  if (!isRecord(cost) || typeof cost.certainty !== "string" || !isRecord(cost.unit)) return null;
  if (typeof cost.unit.code !== "string") return null;
  if (cost.value !== null && typeof cost.value !== "string") return null;
  return {
    certainty: cost.certainty,
    unit: { code: cost.unit.code },
    value: cost.value as string | null,
  };
}
type ResultCheck = { safeParse(value: unknown): { success: boolean } };
let resultCheck: ResultCheck | undefined;
let demotedRead = false;
export function bindModelPlaygroundResultCheck(schema: ResultCheck) {
  resultCheck = schema;
}
export const demotedReadActive = () => demotedRead;
export function withDemotedRead<T>(read: () => T): T {
  demotedRead = true;
  try {
    return read();
  } finally {
    demotedRead = false;
  }
}
function unknownMoneyFor(currency: unknown) {
  const money = {
    amount: null,
    basis: "unknown" as const,
    certainty: "unknown" as const,
    currency,
    rateCardVersion: null,
  };
  return unknownMoney.safeParse(money).success ? money : undefined;
}
function unknownCost(stored: unknown, receiptCurrency: unknown) {
  for (const currency of [stored, receiptCurrency, "USD"]) {
    const parsed = unknownMoneyFor(currency);
    if (parsed) return parsed;
  }
  return (
    unknownMoneyFor("USD") ?? {
      amount: null,
      basis: "unknown" as const,
      certainty: "unknown" as const,
      currency: "USD",
      rateCardVersion: null,
    }
  );
}
function payableCurrency(result: Record<string, unknown>) {
  const receipt = result.paymentReceipt;
  if (!isRecord(receipt) || !isRecord(receipt.option) || !isRecord(receipt.option.payableUnit))
    return undefined;
  return receipt.option.payableUnit.code;
}
function reportedOrNull(value: unknown) {
  return reportedMoney.safeParse(value).success ? value : null;
}
function repairEvidence(evidence: Record<string, unknown>) {
  const reported = evidence.providerReported;
  const upstream = evidence.upstreamInference;
  const candidate: Record<string, unknown> = {
    providerReported:
      isRecord(reported) && reportedMoney.safeParse(reported.money).success ? reported : null,
    upstreamInference: isRecord(upstream)
      ? {
          total: upstream.total == null ? null : reportedOrNull(upstream.total),
          input: upstream.input == null ? null : reportedOrNull(upstream.input),
          output: upstream.output == null ? null : reportedOrNull(upstream.output),
        }
      : null,
    localEstimate: estimatedMoney.safeParse(evidence.localEstimate).success
      ? evidence.localEstimate
      : null,
  };
  if (evidence.upstreamInferenceDiscardReason === "inconsistent")
    candidate.upstreamInferenceDiscardReason = "inconsistent";
  const attempts = [
    candidate,
    { ...candidate, localEstimate: null },
    { ...candidate, localEstimate: null, upstreamInference: null },
    {
      providerReported: null,
      upstreamInference: null,
      localEstimate: null,
    },
  ];
  return attempts.find((item) => publicCostEvidenceSchema.safeParse(item).success);
}
function normalizeEvidence(evidence: unknown, estimate: unknown, demoted: boolean) {
  const intact = publicCostEvidenceSchema.safeParse(evidence).success
    ? evidence
    : isRecord(evidence)
      ? repairEvidence(evidence)
      : undefined;
  if (!demoted || !estimatedMoney.safeParse(estimate).success) return intact;
  const host = isRecord(intact)
    ? intact
    : { providerReported: null, upstreamInference: null, localEstimate: null };
  if (host.localEstimate != null) return host;
  const placed = { ...host, localEstimate: estimate };
  return publicCostEvidenceSchema.safeParse(placed).success ? placed : host;
}
function normalizeResult(result: Record<string, unknown>): {
  demotedEstimate: boolean;
  result: Record<string, unknown>;
} {
  const cost = result.providerCost;
  const parsed = publicProviderCostSchema.safeParse(cost);
  const demotedEstimate = !parsed.success && estimatedMoney.safeParse(cost).success;
  const providerCost = parsed.success
    ? parsed.data
    : unknownCost(isRecord(cost) ? cost.currency : undefined, payableCurrency(result));
  const evidence = normalizeEvidence(result.costEvidence, cost, demotedEstimate);
  const { costEvidence: _previous, ...rest } = result;
  const next: Record<string, unknown> =
    evidence === undefined
      ? { ...rest, providerCost }
      : { ...rest, providerCost, costEvidence: evidence };
  return { demotedEstimate, result: next };
}
function payableUnit(receipt: Record<string, unknown>) {
  const option = receipt.option;
  const cost = receipt.providerCost;
  if (isRecord(option) && isRecord(option.payableUnit)) return option.payableUnit;
  return isRecord(cost) ? cost.unit : undefined;
}
function keepsDemotedReceipt(result: Record<string, unknown>) {
  const receipt = result.paymentReceipt;
  const evidence = result.costEvidence;
  const certainty =
    isRecord(receipt) && isRecord(receipt.providerCost)
      ? receipt.providerCost.certainty
      : undefined;
  return (
    isRecord(result.providerCost) &&
    result.providerCost.certainty === "unknown" &&
    (certainty === "measured" || certainty === "free") &&
    isRecord(receipt) &&
    receipt.costEvidence !== "mismatch" &&
    isRecord(evidence) &&
    evidence.localEstimate != null
  );
}
function withUnknownReceipt(result: Record<string, unknown>, marker: "mismatch" | null) {
  const receipt = result.paymentReceipt;
  if (!isRecord(receipt)) return undefined;
  const { costEvidence: _marker, ...rest } = receipt;
  const next = {
    ...rest,
    providerCost: { certainty: "unknown", unit: payableUnit(receipt), value: null },
  };
  return marker ? { ...next, costEvidence: marker } : next;
}
function mismatchReceipt(result: Record<string, unknown>) {
  const receipt = withUnknownReceipt(result, "mismatch");
  if (!receipt) return undefined;
  const { costEvidence: _dropped, ...withoutEvidence } = result;
  return { ...withoutEvidence, paymentReceipt: receipt };
}
function agreesAsUnknown(result: Record<string, unknown>) {
  const receipt = withUnknownReceipt(result, null);
  return receipt ? { ...result, paymentReceipt: receipt } : undefined;
}
function clearUpstream(result: Record<string, unknown>) {
  if (!isRecord(result.costEvidence)) return result;
  return { ...result, costEvidence: { ...result.costEvidence, upstreamInference: null } };
}
function reducedEvidence(result: Record<string, unknown>, estimate: unknown) {
  const current = isRecord(result.costEvidence) ? result.costEvidence.localEstimate : null;
  const localEstimate = estimatedMoney.safeParse(estimate).success
    ? estimate
    : estimatedMoney.safeParse(current).success
      ? current
      : null;
  return {
    ...result,
    costEvidence: { providerReported: null, upstreamInference: null, localEstimate },
  };
}
function accepts(result: Record<string, unknown>, demoted: boolean) {
  if (!resultCheck || resultCheck.safeParse(result).success) return true;
  if (!demoted || !keepsDemotedReceipt(result)) return false;
  const probe = agreesAsUnknown(result);
  return probe !== undefined && resultCheck.safeParse(probe).success;
}
function guardResult(
  column: Record<string, unknown>,
  result: Record<string, unknown>,
  demoted: boolean,
  estimate: unknown,
) {
  const emit = (next: Record<string, unknown>) => ({ ...column, result: next });
  if (accepts(result, demoted)) return emit(result);
  const upstreamCleared = clearUpstream(result);
  if (upstreamCleared !== result && accepts(upstreamCleared, demoted)) return emit(upstreamCleared);
  const reduced = reducedEvidence(result, estimate);
  if (accepts(reduced, demoted)) return emit(reduced);
  const { costEvidence: _dropped, ...withoutEvidence } = reduced;
  if (accepts(withoutEvidence, demoted)) return emit(withoutEvidence);
  const mismatched = mismatchReceipt(result);
  if (mismatched && accepts(mismatched, demoted)) return emit(mismatched);
  throw new Error("Model Playground result could not be projected.");
}
function projectColumn(column: unknown) {
  if (!isRecord(column) || !isRecord(column.result)) return column;
  const paid =
    isRecord(column.column) &&
    isRecord(column.column.payment) &&
    column.column.payment.fundingSource === "platform";
  // The read API can show a shared run without exposing customer billing records.
  const source = paid ? { ...column.result, paymentReceipt: null } : column.result;
  const estimate = source.providerCost;
  const normalized = normalizeResult(source);
  const result = normalized.result;
  const demoted = normalized.demotedEstimate;
  const receipt = result.paymentReceipt;
  if (!isRecord(receipt) || !isRecord(receipt.providerCost))
    return guardResult(column, result, demoted, estimate);
  const resultCost = agreeableResult(result.providerCost);
  const receiptCost = agreeableReceipt(receipt.providerCost);
  if (!resultCost || !receiptCost) return guardResult(column, result, demoted, estimate);
  const unsettled = resultCost.certainty === "reported" && receiptCost.certainty === "unknown";
  const keep = demoted || unsettled || providerCostsAgree(resultCost, receiptCost);
  if (!keep) return guardResult(column, result, demoted, estimate);
  const { costEvidence: _marker, ...kept } = receipt;
  return guardResult(column, { ...result, paymentReceipt: kept }, demoted, estimate);
}
function markUnprojectable(runId: unknown, column: Record<string, unknown>) {
  const nested = column.column;
  console.error("[model-playground] Could not project a column result.", {
    columnId: isRecord(nested) && typeof nested.columnId === "string" ? nested.columnId : null,
    runId: typeof runId === "string" ? runId : null,
  });
  return { ...column, result: null, resultIssue: "unprojectable" };
}
export function projectModelPlaygroundRun<T>(value: T): T {
  if (!isRecord(value) || !Array.isArray(value.columns)) return value;
  const runId = value.runId;
  return {
    ...value,
    columns: value.columns.map((column) => {
      if (!isRecord(column)) throw new Error("Model Playground result could not be projected.");
      if (column.result != null && !isRecord(column.result))
        return markUnprojectable(runId, column);
      if (column.state === "completed" && column.result == null)
        return markUnprojectable(runId, column);
      try {
        const projected = projectColumn(column);
        return isRecord(projected) ? { ...projected, resultIssue: null } : projected;
      } catch {
        return markUnprojectable(runId, column);
      }
    }),
  } as T;
}
