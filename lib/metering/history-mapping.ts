import { ownAllocationTag } from "@/lib/provider-usage/credential-version";
import { surfaceOf } from "@/lib/provider-usage/surface";
import type { ProviderRequestSource } from "@/lib/provider-usage/tag";
import type { Measurement, Source } from "@usagekit/core";
import type {
  HistoricalIdentity,
  HistoricalOperation,
  HistoricalReceipt,
  LegacyUsageSource,
} from "./history-types";
import { decimalQuantity } from "./mapping";
import { projectAdmissionMeasurements } from "./paid-measurements";
import { platformAllocationTag } from "./paid-quote";
import { canonical, hash } from "./store/codec";

const validSources = new Set(["app", "worker", "api", "cli", "mcp", "sdk"]);
const amount = (unit: string, value: string | null, scale: number): Measurement =>
  value === null
    ? { unit, certainty: "unknown", quantity: null }
    : { unit, certainty: "measured", quantity: decimalQuantity(value, unit, scale) };

/** Uses retained evidence only. Current owners, credentials and manual prices are irrelevant. */
export function historicalOperation(
  legacy: LegacyUsageSource,
  namespace: string,
  cutoverAt: string,
  identity: HistoricalIdentity = {},
): HistoricalOperation {
  // Prisma's legacy timestamp columns store UTC without a zone. JSON emitted by
  // PostgreSQL retains that spelling; Date would otherwise apply the runner's TZ.
  const sourceTime = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(legacy.createdAt)
    ? `${legacy.createdAt.replace(" ", "T")}Z`
    : legacy.createdAt;
  const createdAt = new Date(sourceTime).toISOString();
  const platform = legacy.credentialSource === "hosted";
  const fundingSource = platform ? "platform" : "byok";
  const principal = identity.principal ?? `historical-unattributed:${legacy.projectId}`;
  const zero = legacy.cached || Boolean(identity.canonicalId);
  const known = legacy.measurementStatus === "recorded" || zero;
  const cost = known ? (zero ? "0" : legacy.costCents) : null;
  const customer = platform
    ? zero
      ? "0"
      : identity.debitId
        ? (identity.customerCents ?? null)
        : null
    : null;
  const native = zero ? "0" : legacy.usageQuantity;
  const raw: HistoricalReceipt = {
    id: `legacy-receipt:${hash(canonical(legacy))}`,
    source: "import",
    occurredAt: createdAt,
    recordedAt: cutoverAt,
    cached: legacy.cached,
    failed: legacy.failed,
    evidenceRef: `legacy:${legacy.id}`,
    ...(!identity.canonicalId && legacy.providerRequestId
      ? { providerRequestId: legacy.providerRequestId }
      : {}),
    cost:
      cost === null
        ? { certainty: "unknown", money: null }
        : {
            certainty: "measured",
            money: { units: decimalQuantity(cost, "cents", 4).value, currency: "USD" },
          },
    measurements: [
      amount("units", native, 6),
      ...(platform ? [amount("customer_cents", customer, 4)] : []),
    ],
    metadata: {
      legacy,
      debitId: identity.debitId ?? null,
      attributed: Boolean(identity.principal),
      ...(identity.canonicalId ? { chargeReplayed: true } : {}),
    },
  };
  const projected = projectAdmissionMeasurements({ fundingSource }, raw);
  const receipt = {
    ...projected,
    metadata: raw.metadata,
    measurements: zero
      ? projected.measurements.map(
          (m): Measurement =>
            m.quantity
              ? { ...m, certainty: "measured", quantity: { ...m.quantity, value: 0n } }
              : m,
        )
      : projected.measurements,
  };
  const pending = !legacy.provider || receipt.measurements.some((m) => m.quantity === null);
  const estimate = identity.estimate ?? [];
  return {
    operationId: `legacy:${legacy.id}`,
    scope: {
      namespace: identity.namespace ?? namespace,
      principal,
      group: legacy.projectId,
      connection: legacy.connectionId,
      ...(identity.providerCredentialVersion
        ? { providerCredentialVersion: identity.providerCredentialVersion }
        : {}),
      ...(legacy.provider
        ? {
            tags: [
              (platform ? platformAllocationTag : ownAllocationTag)(
                legacy.provider,
                legacy.connectionId,
              ),
            ],
          }
        : {}),
      ...(legacy.credentialKind && legacy.credentialId
        ? { accessCredential: { kind: legacy.credentialKind, id: legacy.credentialId } }
        : {}),
    },
    fundingSource,
    costOwner: identity.costOwner ?? `historical-unattributed:${legacy.connectionId}`,
    ...(identity.creditAccountRef ? { creditAccountRef: identity.creditAccountRef } : {}),
    ...(identity.customerPriceVersion
      ? { customerPriceVersion: identity.customerPriceVersion }
      : {}),
    ...(identity.platformPoolId ? { platformPools: [identity.platformPoolId] } : {}),
    source: validSources.has(legacy.source ?? "") ? (legacy.source as Source) : "import",
    surface: surfaceOf(legacy.source as ProviderRequestSource | null),
    provider: legacy.provider ?? "historical-unknown",
    operation: legacy.feature,
    ...(legacy.correlationId ? { correlationId: legacy.correlationId } : {}),
    estimate,
    estimateSource: "unknown",
    reservationExpiresAt: createdAt,
    createdAt: createdAt,
    updatedAt: cutoverAt,
    state: pending ? "pending" : "settled",
    version: 1,
    receipts: [receipt],
    budgetEpochs: [],
    lease: null,
  };
}
