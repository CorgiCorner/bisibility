import type { LocalCapability } from "./capability";
import { assertLocalCapability } from "./capability";
import { compareCodeUnits, contentKey, isoTime, requireToken } from "./key";
import { executionTargetKey } from "./target-key";
import type { ExecutionTargetV1 } from "./types";

export type LocalQuote = Readonly<{
  version: 1;
  projectId: string;
  expectedTargetKeys: readonly string[];
  effectiveOptions: Readonly<Record<string, string>>;
  capabilityVersion: string;
  provider: string;
  adapterVersion: string;
  providerPriceVersion: string;
  nativeEstimates: readonly Readonly<{ unit: string; amount: string | null }>[];
  issuedAt: string;
  expiresAt: string;
}>;

function canonicalQuote(input: LocalQuote) {
  if (input.version !== 1) throw new Error("Unsupported local quote version");
  for (const field of [
    input.projectId,
    input.capabilityVersion,
    input.provider,
    input.adapterVersion,
    input.providerPriceVersion,
  ])
    requireToken(field, "quote reference");
  const targets = [...input.expectedTargetKeys].sort();
  if (!targets.length || new Set(targets).size !== targets.length)
    throw new Error("Invalid frozen quote targets");
  targets.forEach((value) => {
    requireToken(value, "quote target");
  });
  const issued = isoTime(input.issuedAt);
  if (isoTime(input.expiresAt) <= issued) throw new Error("Invalid quote expiry");
  const options = Object.entries(input.effectiveOptions).sort(([a], [b]) => compareCodeUnits(a, b));
  for (const [key, value] of options) {
    requireToken(key, "option");
    requireToken(value, "option value");
  }
  const estimates = [...input.nativeEstimates].sort((a, b) => compareCodeUnits(a.unit, b.unit));
  if (!estimates.length || new Set(estimates.map(({ unit }) => unit)).size !== estimates.length)
    throw new Error("Invalid native estimates");
  for (const { unit, amount } of estimates) {
    requireToken(unit, "native unit");
    if (amount !== null && (amount.length > 128 || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(amount)))
      throw new Error("Invalid exact native estimate");
  }
  return [
    1,
    input.projectId,
    targets,
    options,
    input.capabilityVersion,
    input.provider,
    input.adapterVersion,
    input.providerPriceVersion,
    estimates.map(({ unit, amount }) => [unit, amount]),
    input.issuedAt,
    input.expiresAt,
  ];
}

export function localQuoteHash(input: LocalQuote) {
  return contentKey("local-quote-v1", canonicalQuote(input));
}

export function assertFrozenQuoteSelection(
  quote: LocalQuote,
  targets: readonly ExecutionTargetV1[],
) {
  localQuoteHash(quote);
  const actual = targets
    .map((target) => {
      if (target.projectId !== quote.projectId) throw new Error("Quote selection mixes projects");
      return executionTargetKey(target);
    })
    .sort();
  const expected = [...quote.expectedTargetKeys].sort();
  if (
    new Set(actual).size !== actual.length ||
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    throw new Error("Quote does not bind the full frozen selection");
}

export function assertLocalQuote(input: {
  quote: LocalQuote;
  target: ExecutionTargetV1;
  capability: LocalCapability;
  providerPriceVersion: string;
  now: Date;
}) {
  localQuoteHash(input.quote);
  const { quote, target, capability, now } = input;
  const time = now.getTime();
  if (!Number.isFinite(time) || isoTime(quote.issuedAt) > time || isoTime(quote.expiresAt) <= time)
    throw new Error("Local quote expired or not issued yet");
  if (
    quote.projectId !== target.projectId ||
    !quote.expectedTargetKeys.includes(executionTargetKey(target))
  )
    throw new Error("Target is outside the frozen quote");
  if (
    quote.capabilityVersion !== capability.version ||
    quote.provider !== capability.provider ||
    quote.adapterVersion !== capability.adapterVersion ||
    quote.providerPriceVersion !== input.providerPriceVersion
  )
    throw new Error("Capability or price changed; preview again");
  if (!quote.nativeEstimates.some(({ unit }) => unit === capability.nativeBillingUnit))
    throw new Error("Native billing unit is missing");
  assertLocalCapability(target, capability, now);
}
