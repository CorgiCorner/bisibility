import { Prisma } from "@/lib/generated/prisma/client";
import type { PaymentTokenPayload } from "./token";
import { ActionPaymentError } from "./token";

type Child = PaymentTokenPayload["children"][string];
/** A batch may shrink to a subset of its quoted paid items, never add another item. */
export function currentChildAmount(accepted: Child, current?: Child) {
  if (!current) throw new ActionPaymentError("payment_quote_changed");
  if (accepted.items || current.items) {
    if (
      !accepted.items ||
      !current.items ||
      current.items.some((item) => !accepted.items?.includes(item)) ||
      new Set(current.items).size !== current.items.length ||
      new Prisma.Decimal(current.amount).gt(accepted.amount)
    )
      throw new ActionPaymentError("payment_quote_changed");
    return current.free ? "0" : current.amount;
  }
  return current.free ? "0" : accepted.amount;
}
