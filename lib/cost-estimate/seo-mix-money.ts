import type { SeoMixPolicy } from "./seo-mix-contract";

// Provider amounts use 1/100,000,000 cent ticks. Customer amounts use 1/10,000 cent units.
const TICKS_PER_UNIT = 10_000n;
export function decimalTicks(value: string): bigint {
  if (!/^\d{1,12}(\.\d{1,8})?$/.test(value)) throw new Error("Invalid decimal cents");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100_000_000n + BigInt(fraction.padEnd(8, "0"));
}
export function roundedUnits(ticks: bigint): bigint {
  return (ticks + TICKS_PER_UNIT / 2n) / TICKS_PER_UNIT;
}
export function fixedCents(units: bigint): string {
  return `${units / 10_000n}.${String(units % 10_000n).padStart(4, "0")}`;
}
export function hostedPriceUnits(cost: string, quantity: number, policy: SeoMixPolicy): bigint {
  if (
    !Number.isSafeInteger(policy.marginBps) ||
    policy.marginBps < 0 ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1
  )
    throw new Error("Invalid pricing policy");
  const costTicks = decimalTicks(cost);
  if (costTicks <= 0n) throw new Error("Unrepresentable estimate");
  // Retain the margin denominator until the single half-up customer-price rounding.
  let numerator = costTicks * BigInt(10_000 + policy.marginBps);
  if (policy.floorCentsPerUnit !== null) {
    const floor = decimalTicks(policy.floorCentsPerUnit) * BigInt(quantity) * 10_000n;
    if (floor > numerator) numerator = floor;
  }
  const denominator = TICKS_PER_UNIT * 10_000n;
  const price = (numerator + denominator / 2n) / denominator;
  if (price <= 0n || price > 999_999_999_999n) throw new Error("Unrepresentable estimate");
  return price;
}
