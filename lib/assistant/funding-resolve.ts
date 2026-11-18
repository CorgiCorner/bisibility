import type { FundingChoice, FundingMode, FundingOptionView } from "@/lib/assistant/wire";

function cents(value: string) {
  if (!/^\d+(\.\d+)?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0").slice(0, 4));
}

/** A reached monthly cap, open holds included, cannot serve another credits turn. */
export function creditsLimitReached(option: FundingOptionView) {
  if (option.mode !== "credits" || !option.usage?.limitCents) return false;
  const used = cents(option.usage.usedCents);
  const reserved = cents(option.usage.heldCents ?? "0");
  const limit = cents(option.usage.limitCents);
  return used !== null && reserved !== null && limit !== null && used + reserved >= limit;
}

export function fundingServes(option: FundingOptionView | undefined) {
  return Boolean(option?.available) && !creditsLimitReached(option as FundingOptionView);
}

/**
 * Nothing stored: own key when that provider has an active key, otherwise credits when that
 * option can still serve. A stored credits choice is ignored when the credits gate is off.
 */
export function resolveAssistantFunding(input: {
  stored: FundingMode | null;
  provider: FundingChoice["provider"];
  options: readonly FundingOptionView[];
  creditsEnabled: boolean;
}): FundingChoice {
  const options = input.options.filter((item) => item.provider === input.provider);
  const stored = !input.creditsEnabled && input.stored === "credits" ? null : input.stored;
  if (stored) return { mode: stored, provider: input.provider };
  const ownKey = options.some(
    (item) => item.mode === "byok" && item.credential?.status === "active",
  );
  return { mode: ownKey ? "byok" : "credits", provider: input.provider };
}

export function storedFundingMode(value: string | null | undefined): FundingMode | null {
  return value === "byok" || value === "credits" ? value : null;
}
