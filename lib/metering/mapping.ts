import { createHash } from "node:crypto";
import { surfaceOf } from "@/lib/provider-usage/surface";
import type { ProviderRequestSource } from "@/lib/provider-usage/tag";
import type { Budget, Measurement, Quantity, Receipt, ReserveInput } from "@usagekit/core";

export type UsageEntry = {
  unit?: "cents" | "units";
  id: string;
  ownerId: string;
  projectId: string;
  connectionId: string;
  provider: string;
  feature: string;
  source: ProviderRequestSource;
  /** Hosted entries draw platform funding from the shared provider key pool. */
  credentialSource?: "own" | "hosted";
  correlationId?: string | null;
  credentialKind?: string | null;
  credentialId?: string | null;
  createdAt: Date;
  costCents: string;
  usageQuantity: string | null;
  measurementStatus: string;
  cached: boolean;
  failed: boolean;
  providerRequestId?: string | null;
};
export function decimalQuantity(value: string, unit: string, scale: number): Quantity {
  if (!/^\d+(\.\d+)?$/.test(value)) throw new TypeError("Invalid exact metering amount");
  const [whole = "0", fraction = ""] = value.split(".");
  if (fraction.slice(scale).replaceAll("0", ""))
    throw new RangeError("Metering precision exceeded");
  return { value: BigInt(whole + fraction.slice(0, scale).padEnd(scale, "0")), scale, unit };
}
export function reserveFromEntry(
  namespace: string,
  entry: UsageEntry,
  estimate: { cents: string; units: string },
): ReserveInput {
  const hosted = entry.credentialSource === "hosted";
  return {
    operationId: entry.id,
    reservationTtlMs: 3600000,
    scope: {
      namespace,
      principal: entry.ownerId,
      group: entry.projectId,
      connection: entry.connectionId,
      ...(entry.credentialKind && entry.credentialId
        ? { accessCredential: { kind: entry.credentialKind, id: entry.credentialId } }
        : {}),
    },
    fundingSource: hosted ? "platform" : "byok",
    // No stable private pool id exists for the shared hosted key, so the pool is provider-scoped.
    ...(hosted ? { platformPools: [`hosted:${entry.provider}`] } : {}),
    costOwner: entry.ownerId,
    surface: surfaceOf(entry.source),
    source: entry.source,
    provider: entry.provider,
    operation: entry.feature,
    estimate: [
      decimalQuantity(estimate.cents, "cents", 4),
      decimalQuantity(estimate.units, "units", 6),
    ],
    ...(entry.correlationId ? { correlationId: entry.correlationId } : {}),
  };
}
export function receiptFromEntry(entry: UsageEntry, now: Date): Receipt {
  const known = entry.measurementStatus === "recorded";
  const measurements: Measurement[] = [
    known
      ? {
          unit: "cents",
          certainty: "measured",
          quantity: decimalQuantity(entry.costCents, "cents", 4),
        }
      : { unit: "cents", certainty: "unknown", quantity: null },
    known && entry.usageQuantity !== null
      ? {
          unit: "units",
          certainty: "measured",
          quantity: decimalQuantity(entry.usageQuantity, "units", 6),
        }
      : { unit: "units", certainty: "unknown", quantity: null },
  ];
  if (known && entry.usageQuantity === null && entry.unit !== "units") measurements.splice(1, 1);
  const content = JSON.stringify([
    entry.id,
    entry.costCents,
    entry.usageQuantity,
    entry.measurementStatus,
    entry.providerRequestId,
    entry.cached,
    entry.failed,
  ]);
  return {
    id: createHash("sha256").update(content).digest("hex"),
    measurements,
    cost: known
      ? {
          certainty: "measured",
          money: { units: decimalQuantity(entry.costCents, "cents", 4).value, currency: "USD" },
        }
      : { certainty: "unknown", money: null },
    occurredAt: entry.createdAt.toISOString(),
    recordedAt: now.toISOString(),
    cached: entry.cached,
    failed: entry.failed,
    ...(entry.providerRequestId ? { providerRequestId: entry.providerRequestId } : {}),
    evidenceRef: entry.id,
  };
}
export function allocationBudgets(
  namespace: string,
  connection: {
    id: string;
    unit: "cents" | "units";
    app: string | null;
    programmatic: string | null;
  },
  version: number,
): Budget[] {
  return (["app", "programmatic"] as const).map((surface) => ({
    id: `connection:${connection.id}:${surface}`,
    version,
    scope: { kind: "connection", namespace, connection: connection.id },
    surface,
    unit: connection.unit,
    limit:
      connection[surface] === null
        ? null
        : decimalQuantity(
            connection[surface],
            connection.unit,
            connection.unit === "cents" ? 4 : 6,
          ),
    window: { kind: "calendar_month", timezone: "UTC" },
    onExceed: "warn",
  }));
}
