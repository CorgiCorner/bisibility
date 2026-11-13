import { normalizeDomain } from "@/lib/domains/normalize";
import { getDomain } from "tldts";
import {
  type SourceCatalog,
  type SourceCatalogType,
  sourceCatalog,
  sourceCatalogTypes,
} from "./source-catalog";

/** Types a person can assign. `other` is the manual bucket outside the catalog. */
export const sourceOverrideTypes = [
  "directory",
  "reviews",
  "community",
  "editorial",
  "other",
] as const;

export type SourceOverrideType = (typeof sourceOverrideTypes)[number];

export type SourceOrigin = "you" | "not_you" | "competitor" | "override" | "catalog" | "unsorted";

export type SourceDisplayType = "you" | "not_you" | "competitor" | SourceOverrideType | "unsorted";

export type SourceClass = {
  origin: SourceOrigin;
  type: SourceDisplayType;
};

export type SourceClassContext = {
  catalog?: SourceCatalog;
  competitorDomains: readonly string[];
  excludedNames: readonly string[];
  override: SourceOverrideType | null;
  ownDomain: string | null;
};

const FIXED_ORIGINS = new Set<SourceOrigin>(["you", "not_you", "competitor"]);

export function isFixedSourceOrigin(origin: SourceOrigin) {
  return FIXED_ORIGINS.has(origin);
}

/** Registrable host, lowercase, with a leading www removed. Subdomains fold in. */
export function registrableSourceDomain(value: string): string | null {
  const host = normalizeDomain(value);
  if (!host || host.includes(":")) return null;
  const registrable = getDomain(host, { allowPrivateDomains: false });
  return registrable ? registrable.toLowerCase() : null;
}

function domainSet(values: readonly string[]) {
  return new Set(
    values.flatMap((value) => {
      const domain = registrableSourceDomain(value);
      return domain ? [domain] : [];
    }),
  );
}

function catalogType(domain: string, catalog: SourceCatalog): SourceCatalogType | null {
  for (const type of sourceCatalogTypes) {
    if (catalog[type].includes(domain)) return type;
  }
  return null;
}

/**
 * Own site, then an excluded lookalike domain, then a competitor, then a
 * manual type, then the starter catalog. Anything else is unsorted.
 */
export function classifySourceDomain(value: string, context: SourceClassContext): SourceClass {
  const domain = registrableSourceDomain(value);
  if (!domain) return { origin: "unsorted", type: "unsorted" };
  if (context.ownDomain && domainSet([context.ownDomain]).has(domain)) {
    return { origin: "you", type: "you" };
  }
  if (domainSet(context.excludedNames).has(domain)) {
    return { origin: "not_you", type: "not_you" };
  }
  if (domainSet(context.competitorDomains).has(domain)) {
    return { origin: "competitor", type: "competitor" };
  }
  if (context.override) return { origin: "override", type: context.override };
  const known = catalogType(domain, context.catalog ?? sourceCatalog);
  if (known) return { origin: "catalog", type: known };
  return { origin: "unsorted", type: "unsorted" };
}
