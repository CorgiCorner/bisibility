import { Prisma } from "@/lib/generated/prisma/client";

/** Sum of a hosted reservation quote. Undefined when the quote has no price map. */
export function sumQuotedCents(prices: Record<string, string> | undefined): number | undefined {
  if (!prices) return undefined;
  const total = Number(
    Object.values(prices).reduce((sum, price) => sum.plus(price), new Prisma.Decimal(0)),
  );
  return Number.isFinite(total) ? total : undefined;
}
