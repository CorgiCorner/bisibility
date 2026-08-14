import { normalizeDomain } from "@/lib/domains/normalize";
import { ProviderLookupSignal } from "@/lib/provider-lookups/paid-call";
import { researchCountryLocationCode, supportsResearchMarket } from "@/lib/serp/market-capability";
import { getDomain } from "tldts";
import type {
  AnalyzeDomainOverviewOptions,
  DomainOverviewMarket,
  DomainOverviewScope,
} from "./types";

const DEFAULT_PAGE_LIMIT = 100;

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
  const countryCode = options.countryCode?.trim().toUpperCase();
  const languageCode = options.languageCode.trim().toLowerCase();
  if (!Number.isInteger(options.locationCode) || options.locationCode <= 0 || !languageCode) {
    throw new ProviderLookupSignal({ ok: false, reason: "unsupported_location" });
  }
  if (countryCode && !supportsResearchMarket(countryCode, languageCode)) {
    throw new ProviderLookupSignal({ ok: false, reason: "unsupported_location" });
  }
  return {
    ...(countryCode ? { countryCode } : {}),
    languageCode,
    locationCode: options.locationCode,
  };
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
  return countryCode ? researchCountryLocationCode(countryCode) : null;
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
