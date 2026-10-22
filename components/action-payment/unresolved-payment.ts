export function unresolvedPayment(outcome: unknown): boolean {
  if (!outcome || typeof outcome !== "object") return false;
  if (
    ("reason" in outcome && outcome.reason === "payment_already_executed") ||
    ("charged" in outcome && outcome.charged === null) ||
    ("ok" in outcome &&
      outcome.ok === false &&
      "costCents" in outcome &&
      outcome.costCents === null)
  )
    return true;
  if (
    !("payment" in outcome) ||
    !outcome.payment ||
    typeof outcome.payment !== "object" ||
    !("state" in outcome.payment)
  )
    return false;
  return outcome.payment.state === "pending" || outcome.payment.state === "unknown";
}
