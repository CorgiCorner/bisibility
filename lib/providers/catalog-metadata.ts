import { PROVIDER_ALLOCATION_METADATA } from "./allocation-metadata";
import { localSequenceProviderEnabled } from "./serp/synthetic-mode";
import type { ProviderCatalogEntry } from "./types";

/** Display and credential metadata never initialize provider transports. */
const BASE_PROVIDER_CATALOG = [
  {
    id: "dataforseo",
    allocation: PROVIDER_ALLOCATION_METADATA.dataforseo,
    label: "DataForSEO",
    kind: "serp",
    defaultStatus: "ready",
    requiredCredentials: ["login", "password"],
    logoDomain: "dataforseo.com",
  },
  {
    id: "serpapi",
    allocation: PROVIDER_ALLOCATION_METADATA.serpapi,
    label: "SerpApi",
    kind: "serp",
    defaultStatus: "ready",
    requiredCredentials: ["apiKey"],
    logoDomain: "serpapi.com",
  },
  {
    id: "gsc",
    allocation: PROVIDER_ALLOCATION_METADATA.gsc,
    label: "Google Search Console",
    kind: "analytics",
    defaultStatus: "optional",
    requiredCredentials: ["apiKey", "login"],
    logoDomain: "google.com",
  },
  {
    id: "ga4",
    allocation: PROVIDER_ALLOCATION_METADATA.ga4,
    label: "Google Analytics 4",
    kind: "analytics",
    defaultStatus: "optional",
    requiredCredentials: ["apiKey", "login"],
    logoDomain: "google.com",
  },
  {
    id: "plausible",
    allocation: PROVIDER_ALLOCATION_METADATA.plausible,
    label: "Plausible",
    kind: "analytics",
    defaultStatus: "optional",
    requiredCredentials: ["apiKey", "login"],
    // Plausible's "login" is the site domain (site_id); it is not an account login.
    credentialLabels: { apiKey: "API token (api_key)", login: "site domain (login)" },
    loginDefaultsToProjectDomain: true,
    logoDomain: "plausible.io",
  },
] as const satisfies ProviderCatalogEntry[];

const LOCAL_SEQUENCE_CATALOG_ITEM = {
  id: "local-sequence",
  allocation: PROVIDER_ALLOCATION_METADATA["local-sequence"],
  label: "Local rank test",
  kind: "serp",
  defaultStatus: "ready",
  logoDomain: undefined,
  requiredCredentials: [],
} as const satisfies ProviderCatalogEntry;

const localSequenceEnabled = localSequenceProviderEnabled(
  process.env.NODE_ENV,
  process.env.BISIBILITY_DEV_SERP_PROVIDER,
);

export const PROVIDER_CATALOG = [
  ...BASE_PROVIDER_CATALOG,
  ...(localSequenceEnabled ? [LOCAL_SEQUENCE_CATALOG_ITEM] : []),
] as const satisfies readonly ProviderCatalogEntry[];
