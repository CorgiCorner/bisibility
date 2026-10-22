import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { loadByokEvidence } from "@/lib/provider-usage/byok-evidence-storage";
import type { ActionPaymentOption, ActionPaymentReceipt, PaymentAmount } from "./contract";
import { readDeploymentPayment } from "./deployment-extension";
import type { PaymentPart } from "./paid-call";
import type { ProviderPaymentDescriptor } from "./provider-descriptor";

const usd = { kind: "currency", code: "USD" } as const;
export function providerPaymentAmount(
  descriptor: ProviderPaymentDescriptor,
  costCents: string | null,
  quantity: string | null,
): PaymentAmount {
  const supportedCost = descriptor.unit.kind === "currency" && descriptor.unit.code === "USD";
  const raw = descriptor.basis === "provider_cost" ? (supportedCost ? costCents : null) : quantity;
  return {
    unit: descriptor.unit,
    value:
      raw === null
        ? null
        : descriptor.basis === "provider_cost"
          ? new Prisma.Decimal(raw).div(100).toFixed()
          : new Prisma.Decimal(raw).toFixed(),
    certainty: raw === null ? "unknown" : "measured",
  };
}
export async function readPaymentPart(
  option: ActionPaymentOption,
  descriptor: ProviderPaymentDescriptor,
  input: { operationKey?: string; attemptIds?: readonly string[] },
): Promise<PaymentPart> {
  if (option.fundingSource === "platform") {
    const evidence = input.operationKey ? await readDeploymentPayment(input.operationKey) : null;
    return {
      attempted: evidence?.attempted ?? true,
      charge: {
        value: evidence?.charge ?? null,
        unit: option.payableUnit,
        certainty: evidence?.charge == null ? "unknown" : "measured",
      },
      providerCost: {
        value:
          evidence?.providerCostCents == null
            ? null
            : new Prisma.Decimal(evidence.providerCostCents).div(100).toFixed(),
        unit: usd,
        certainty: evidence?.providerCostCents == null ? "unknown" : "measured",
      },
    };
  }
  const rows = await Promise.all(
    (input.attemptIds ?? []).map((id) => loadByokEvidence(prisma, id)),
  );
  if (!input.attemptIds?.length)
    return {
      attempted: false,
      charge: { value: "0", unit: option.payableUnit, certainty: "free" },
    };
  const known = rows.length > 0 && rows.every((row) => row?.measurementStatus === "recorded");
  const cost =
    known && rows.every((row) => row?.costMeasurement === "recorded")
      ? rows.reduce((sum, row) => sum.plus(row?.costCents ?? 0), new Prisma.Decimal(0)).toFixed()
      : null;
  const quantity =
    known && rows.every((row) => row?.quantityMeasurement === "recorded")
      ? rows
          .reduce((sum, row) => sum.plus(row?.usageQuantity ?? 0), new Prisma.Decimal(0))
          .toFixed()
      : null;
  return {
    attempted: true,
    charge: providerPaymentAmount(descriptor, cost, quantity),
    providerCost: {
      value: cost === null ? null : new Prisma.Decimal(cost).div(100).toFixed(),
      unit: usd,
      certainty: cost === null ? "unknown" : "measured",
    },
  };
}
export function actionPaymentReceipt(
  id: string,
  option: ActionPaymentOption,
  parts: readonly PaymentPart[],
  attempted: boolean,
): ActionPaymentReceipt {
  const unknown = parts.some((part) => part.charge.value === null) || (attempted && !parts.length);
  const value = unknown
    ? null
    : parts
        .reduce((sum, part) => sum.plus(part.charge.value ?? 0), new Prisma.Decimal(0))
        .toFixed();
  return {
    actionId: id,
    quoteId: id,
    option,
    state: unknown ? "unknown" : attempted ? "settled" : "free",
    charge: {
      value,
      unit: option.payableUnit,
      certainty: unknown ? "unknown" : attempted ? "measured" : "free",
    },
  };
}
