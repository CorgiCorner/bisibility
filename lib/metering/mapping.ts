import { createHash } from "node:crypto";
import { surfaceOf } from "@/lib/provider-usage/surface";
import type { ProviderRequestSource } from "@/lib/provider-usage/tag";
import type { Budget, Measurement, Quantity, Receipt, ReserveInput } from "@usagekit/core";

export type UsageEntry = {
  namespace?: string;
  proofVersion?: number;
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
  costMeasurement?: "recorded" | "unknown";
  quantityMeasurement?: "recorded" | "unknown";
  cached: boolean;
  failed: boolean;
  providerRequestId?: string | null;
  creditAccountRef?: string;
  customerPriceVersion?: string;
  estimatedPriceCents?: string;
  customerCents?: string | null;
  platformPoolId?: string;
  providerCredentialVersion?: string;
  providerCostOwner?: string;
  allocationTag?: string;
  publicConnectionId?: string | null;
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
  if (
    hosted &&
    (!entry.platformPoolId || !entry.providerCredentialVersion || !entry.providerCostOwner)
  )
    throw new TypeError("Platform funding requires a retained account and credential version");
  return {
    operationId: entry.id,
    reservationTtlMs: 3600000,
    scope: {
      namespace: entry.namespace ?? namespace,
      principal: entry.ownerId,
      group: entry.projectId,
      connection: entry.connectionId,
      ...(entry.providerCredentialVersion
        ? { providerCredentialVersion: entry.providerCredentialVersion }
        : {}),
      ...(!hosted && entry.allocationTag ? { tags: [entry.allocationTag] } : {}),
      ...(entry.credentialKind && entry.credentialId
        ? { accessCredential: { kind: entry.credentialKind, id: entry.credentialId } }
        : {}),
    },
    fundingSource: hosted ? "platform" : "byok",
    ...(hosted && entry.platformPoolId ? { platformPools: [entry.platformPoolId] } : {}),
    costOwner: hosted ? (entry.providerCostOwner as string) : entry.ownerId,
    ...(entry.creditAccountRef ? { creditAccountRef: entry.creditAccountRef } : {}),
    ...(entry.customerPriceVersion ? { customerPriceVersion: entry.customerPriceVersion } : {}),
    surface: surfaceOf(entry.source),
    source: entry.source,
    provider: entry.provider,
    operation: entry.feature,
    estimate: [
      decimalQuantity(estimate.cents, "cents", 4),
      decimalQuantity(estimate.units, "units", 6),
      ...(entry.estimatedPriceCents
        ? [decimalQuantity(entry.estimatedPriceCents, "customer_cents", 4)]
        : []),
    ],
    ...(entry.correlationId ? { correlationId: entry.correlationId } : {}),
  };
}
export function receiptFromEntry(entry: UsageEntry, now: Date): Receipt {
  const known = entry.measurementStatus === "recorded";
  const knownCost = entry.costMeasurement ? entry.costMeasurement === "recorded" : known;
  const knownQuantity = entry.quantityMeasurement
    ? entry.quantityMeasurement === "recorded"
    : known;
  const measurements: Measurement[] = [
    knownCost
      ? {
          unit: "cents",
          certainty: "measured",
          quantity: decimalQuantity(entry.costCents, "cents", 4),
        }
      : { unit: "cents", certainty: "unknown", quantity: null },
    knownQuantity && entry.usageQuantity !== null
      ? {
          unit: "units",
          certainty: "measured",
          quantity: decimalQuantity(entry.usageQuantity, "units", 6),
        }
      : { unit: "units", certainty: "unknown", quantity: null },
  ];
  if (entry.customerCents !== undefined)
    measurements.push(
      entry.customerCents === null
        ? { unit: "customer_cents", certainty: "unknown", quantity: null }
        : {
            unit: "customer_cents",
            certainty: "measured",
            quantity: decimalQuantity(entry.customerCents, "customer_cents", 4),
          },
    );
  if (known && entry.usageQuantity === null && entry.unit !== "units") measurements.splice(1, 1);
  const content = JSON.stringify([
    entry.id,
    entry.proofVersion,
    entry.costCents,
    entry.usageQuantity,
    entry.measurementStatus,
    entry.costMeasurement,
    entry.quantityMeasurement,
    entry.providerRequestId,
    entry.cached,
    entry.failed,
    entry.customerCents,
  ]);
  return {
    id: createHash("sha256").update(content).digest("hex"),
    measurements,
    cost: knownCost
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
    unit: "cents" | "units" | "customer_cents";
    app: string | null;
    programmatic: string | null;
    allocationTag?: string;
  },
  version: number,
): Budget[] {
  return (["app", "programmatic"] as const).map((surface) => ({
    id: `${connection.allocationTag ? "own-connection" : "connection"}:${connection.id}:${surface}`,
    version,
    scope: connection.allocationTag
      ? { kind: "tag", namespace, tag: connection.allocationTag }
      : { kind: "connection", namespace, connection: connection.id },
    surface,
    unit: connection.unit,
    limit:
      connection[surface] === null
        ? null
        : decimalQuantity(
            connection[surface],
            connection.unit,
            connection.unit === "units" ? 6 : 4,
          ),
    window: { kind: "calendar_month", timezone: "UTC" },
    onExceed: "allow",
  }));
}
