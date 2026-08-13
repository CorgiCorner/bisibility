import { normalizeDomain } from "@/lib/domains/normalize";
import { ProviderLookupSignal } from "@/lib/provider-lookups/paid-call";
import { getDomain } from "tldts";
import type {
  AnalyzeDomainOverviewOptions,
  DomainOverviewMarket,
  DomainOverviewScope,
} from "./types";

const DEFAULT_PAGE_LIMIT = 100;

// DataForSEO Labs uses Google Ads geo target constants for country-level lookups.
// Country rows in the shared location model intentionally use names, so Domain
// Overview supplies the equivalent numeric handle required by its persisted key.
const DATAFORSEO_LABS_COUNTRY_CODES: Readonly<Record<string, number>> = {
  AE: 2784,
  AT: 2040,
  AU: 2036,
  BE: 2056,
  BR: 2076,
  CA: 2124,
  CH: 2756,
  DE: 2276,
  DK: 2208,
  ES: 2724,
  FI: 2246,
  FR: 2250,
  GB: 2826,
  IE: 2372,
  IN: 2356,
  IT: 2380,
  JP: 2392,
  MX: 2484,
  NL: 2528,
  NO: 2578,
  NZ: 2554,
  PL: 2616,
  PT: 2620,
  SE: 2752,
  SG: 2702,
  US: 2840,
  ZA: 2710,
};

export class UnsupportedDomainOverviewTargetError extends Error {
  readonly code = "unsupported_target";

  constructor(message = "The domain overview target is not supported.") {
    super(message);
    this.name = "UnsupportedDomainOverviewTargetError";
  }
}

export function normalizeDomainOverviewTarget(
  value: string,
  scopeOverride?: DomainOverviewScope,
): { scope: DomainOverviewScope; target: string } {
  const hostname = normalizeDomain(value);
  const registrable = hostname ? getDomain(hostname, { allowPrivateDomains: false }) : null;
  if (!hostname || !registrable) {
    throw new UnsupportedDomainOverviewTargetError(
      "The domain overview target must be a public domain.",
    );
  }
  const detected = hostname === registrable ? "root" : "subdomain";
  if (detected === "root" && scopeOverride === "subdomain") {
    throw new UnsupportedDomainOverviewTargetError(
      "A root domain does not have a distinct subdomain scope.",
    );
  }
  const scope = scopeOverride ?? detected;
  return { scope, target: scope === "root" ? registrable : hostname };
}

export function normalizeDomainOverviewMarket(options: DomainOverviewMarket) {
  const languageCode = options.languageCode.trim().toLowerCase();
  if (!Number.isInteger(options.locationCode) || options.locationCode <= 0 || !languageCode) {
    throw new ProviderLookupSignal({ ok: false, reason: "unsupported_location" });
  }
  return { languageCode, locationCode: options.locationCode };
}

export function domainOverviewLocationCode(location: {
  countryCode?: string | null;
  kind?: "city" | "country" | "region";
  primaryGeoCode?: number | null;
}) {
  if (location.primaryGeoCode && Number.isInteger(location.primaryGeoCode)) {
    return location.primaryGeoCode;
  }
  if (location.kind && location.kind !== "country") return null;
  const countryCode = location.countryCode?.trim().toUpperCase();
  return countryCode ? (DATAFORSEO_LABS_COUNTRY_CODES[countryCode] ?? null) : null;
}

export function domainOverviewPageLimit(value: number | undefined, maximum: number) {
  const resolved = value ?? DEFAULT_PAGE_LIMIT;
  return Math.max(1, Math.min(maximum, Math.trunc(resolved)));
}

export function normalizeDomainOverviewAnalysis(options: AnalyzeDomainOverviewOptions) {
  return {
    ...normalizeDomainOverviewMarket(options),
    ...normalizeDomainOverviewTarget(options.target, options.scopeOverride),
    keywordLimit: domainOverviewPageLimit(options.keywordLimit, 100),
    pageLimit: domainOverviewPageLimit(options.pageLimit, 1_000),
  };
}
