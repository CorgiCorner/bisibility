import "server-only";
import type { ActionPaymentReceipt } from "@/lib/action-payment/contract";
import { actionPaymentReceiptSchema } from "@/lib/action-payment/schema";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import type { DomainOverviewResearchScope, DomainOverviewScope } from "./types";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function domainPaymentHistory(overview: unknown) {
  const source = record(overview);
  const original = actionPaymentReceiptSchema.safeParse(source._payment);
  const append = actionPaymentReceiptSchema.safeParse(source._appendPayment);
  const history = actionPaymentReceiptSchema.safeParse(source._historyPayment);
  return {
    ...(original.success ? { originalPayment: original.data } : {}),
    ...(append.success ? { appendPayment: append.data } : {}),
    ...(history.success ? { historyPayment: history.data } : {}),
  };
}

/** Financial facts only. A stale revision or another analysis can never be relabelled. */
export async function retainDomainPayment(
  input: DomainOverviewResearchScope & {
    projectId: string;
    provider: string;
    target: string;
    scope: DomainOverviewScope;
    fetchedAt: string | Date;
    receipt: ActionPaymentReceipt;
    slot: "_payment" | "_appendPayment" | "_historyPayment";
  },
) {
  if (input.receipt.state === "free") return false;
  const receipt = actionPaymentReceiptSchema.parse(input.receipt);
  if (receipt.option.providerId !== input.provider)
    throw new Error("Snapshot payment provider mismatch.");
  const where = {
    projectId: input.projectId,
    provider: input.provider,
    target: input.target,
    scope: input.scope,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    fetchedAt: new Date(input.fetchedAt),
  };
  const current = await prisma.domainOverviewSnapshot.findFirst({
    where,
    select: { overview: true },
  });
  if (!current) return false;
  const source = record(current.overview);
  const prior = actionPaymentReceiptSchema.safeParse(source[input.slot]);
  if (input.slot === "_payment" && prior.success && prior.data.actionId !== receipt.actionId)
    return false;
  const overview = {
    ...(current.overview === null ? { _noData: true } : source),
    [input.slot]: receipt,
  };
  const saved = await prisma.domainOverviewSnapshot.updateMany({
    where: {
      ...where,
      overview: {
        equals:
          current.overview === null ? Prisma.JsonNull : (current.overview as Prisma.InputJsonValue),
      },
    },
    data: { overview: overview as unknown as Prisma.InputJsonValue },
  });
  return saved.count === 1;
}
