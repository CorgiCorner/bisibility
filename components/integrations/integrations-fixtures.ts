import { INTEGRATION_CATEGORY_COPY } from "@/lib/integrations/category-copy";
import { providerCredentialFieldsFor } from "@/lib/integrations/credential-fields";
import { COST_ESTIMATE_PER_CHECK_HELP } from "@/lib/integrations/settings-copy";
import type {
  DrawerDefaults,
  IntegrationCategoryData,
  IntegrationProviderData,
  ProviderMetaRow,
} from "@/lib/integrations/types";
import { DEFAULT_SERP_DEPTH } from "@/lib/serp/constants";

const iconNames = ["chart", "database", "globe", "link", "magnifier", "table", "trend"] as const;
export type ProviderIconName = (typeof iconNames)[number];

export type CredentialFieldName = "endpoint" | "login" | "secret";

export type CredentialField = {
  description?: string;
  name: CredentialFieldName;
  label: string;
  optional?: boolean;
  placeholder: string;
  type?: "password" | "text";
};

export type { ProviderMetaRow } from "@/lib/integrations/types";

// Fixed instants so the stories and tests render the same elapsed copy on every run.
const FIXTURE_NOW = "2026-02-02T12:00:00.000Z";
const FIXTURE_RECENT = "2026-02-02T11:48:00.000Z";
const FIXTURE_YESTERDAY = "2026-02-01T12:00:00.000Z";

export type IntegrationProvider = IntegrationProviderData;
export type IntegrationCategoryFixture = IntegrationCategoryData;

const baseDrawerDefaults: DrawerDefaults = {
  depth: `Top ${DEFAULT_SERP_DEPTH}`,
  device: "Desktop",
  endpoint: "",
  language: "English",
  locationKey: "US",
  login: "",
  secret: "",
};

type DrawerInput = Omit<IntegrationProvider["drawer"], "costHelp" | "defaults" | "envHint"> &
  Partial<Pick<IntegrationProvider["drawer"], "costHelp" | "envHint">> & {
    defaults?: Partial<DrawerDefaults>;
  };

const fallbackReady: ProviderMetaRow = { labelKey: "fallbackState", valueKey: "enabled" };
const googleCostHelp = `Google API and quota usage stay with your own Google project. ${COST_ESTIMATE_PER_CHECK_HELP}`;

function activities(lastUsed: ProviderMetaRow["valueKey"] | string): ProviderMetaRow[] {
  const used: ProviderMetaRow =
    lastUsed === "never"
      ? { labelKey: "lastUsed", valueKey: "never" }
      : { labelKey: "lastUsed", relativeTo: FIXTURE_NOW, valueAt: lastUsed };
  return [
    used,
    { labelKey: "connectionUpdated", relativeTo: FIXTURE_NOW, valueAt: FIXTURE_YESTERDAY },
    fallbackReady,
  ];
}

function makeDrawer(input: DrawerInput): IntegrationProvider["drawer"] {
  return {
    activities: input.activities,
    costHelp: input.costHelp ?? COST_ESTIMATE_PER_CHECK_HELP,
    credentialFields: input.credentialFields,
    defaults: {
      ...baseDrawerDefaults,
      ...input.defaults,
    },
    envHint: input.envHint ?? "Credentials can also be configured through environment variables.",
    rates: input.rates,
  };
}

export const integrationCategories = [
  {
    id: "serp",
    ...INTEGRATION_CATEGORY_COPY.serp,
    providers: [
      {
        id: "dataforseo",
        kind: "serp",
        name: "DataForSEO",
        icon: "database",
        tint: "#E0705C",
        description: "Google rank-data provider for tracked keywords. You pay DataForSEO directly.",
        status: "connected",
        primary: true,
        secondaryAction: "Test",
        meta: [
          { labelKey: "lastRankCheck", relativeTo: FIXTURE_NOW, valueAt: FIXTURE_RECENT },
          { labelKey: "state", valueKey: "enabled" },
        ],
        drawer: makeDrawer({
          activities: activities(FIXTURE_RECENT),
          costHelp: COST_ESTIMATE_PER_CHECK_HELP,
          credentialFields: providerCredentialFieldsFor("dataforseo", { connected: true }),
          defaults: { costPerCheck: 0.0155, login: "team@example.com" },
          rates: [
            {
              amountCents: 1.55,
              checkedAt: "2026-07-27T00:00:00.000Z",
              fallbackSource: "list",
              feature: "rank_check",
              label: "Rank check",
              sampleSize: 248,
              source: "measured",
              unit: "checks",
            },
            {
              amountCents: 1,
              fallbackSource: "list",
              feature: "keyword_research",
              label: "Keyword research",
              source: "manual",
              unit: "calls",
            },
            {
              amountCents: 1,
              checkedAt: "2026-07-22T00:00:00.000Z",
              feature: "keyword_metrics",
              label: "Keyword metrics",
              source: "list",
              unit: "calls",
            },
            {
              feature: "ranked_keywords",
              label: "Ranked keywords",
              source: "unknown",
              unit: "calls",
            },
            {
              amountCents: 1.212,
              checkedAt: "2026-08-11T00:00:00.000Z",
              editable: false,
              feature: "domain_rank_overview",
              label: "Domain overview",
              source: "list",
              unit: "calls",
            },
            {
              amountCents: 12.12,
              checkedAt: "2026-08-11T00:00:00.000Z",
              editable: false,
              feature: "historical_rank_overview",
              label: "Organic history",
              source: "list",
              unit: "calls",
            },
            {
              amountCents: 2.4,
              checkedAt: "2026-08-11T00:00:00.000Z",
              editable: false,
              feature: "relevant_pages",
              label: "Relevant pages (100)",
              source: "list",
              unit: "loads",
            },
          ],
        }),
      },
      {
        id: "serpapi",
        kind: "serp",
        name: "SerpApi",
        icon: "globe",
        tint: "#6B6657",
        description:
          "Alternative SERP provider for rank checks. Keep available for provider switching.",
        status: "ready",
        meta: [
          { labelKey: "lastRankCheck", valueKey: "never" },
          { labelKey: "state", valueKey: "ready" },
        ],
        drawer: makeDrawer({
          activities: activities("never"),
          credentialFields: providerCredentialFieldsFor("serpapi", { connected: false }),
          rates: [
            {
              amountCents: 10,
              checkedAt: "2026-07-15T00:00:00.000Z",
              feature: "rank_check",
              label: "Rank check",
              source: "list",
              unit: "checks",
            },
          ],
        }),
      },
    ],
  },
  {
    id: "analytics",
    ...INTEGRATION_CATEGORY_COPY.analytics,
    providers: [
      {
        id: "gsc",
        kind: "analytics",
        name: "Google Search Console",
        icon: "magnifier",
        tint: "#4F86E8",
        description:
          "Clicks, impressions, CTR and queries from Google Search. Powers GSC-based alerts.",
        status: "connected",
        secondaryAction: "Test",
        meta: [
          { labelKey: "lastSync", relativeTo: FIXTURE_NOW, valueAt: FIXTURE_YESTERDAY },
          { labelKey: "state", valueKey: "enabled" },
        ],
        drawer: makeDrawer({
          activities: activities(FIXTURE_YESTERDAY),
          costHelp: googleCostHelp,
          credentialFields: providerCredentialFieldsFor("gsc", { connected: true }),
        }),
      },
      {
        id: "ga4",
        kind: "analytics",
        name: "Google Analytics 4",
        icon: "chart",
        tint: "#E0A93B",
        description: "Sessions, events and conversions for tying rankings to business outcomes.",
        status: "ready",
        meta: [
          { labelKey: "lastSync", valueKey: "never" },
          { labelKey: "state", valueKey: "ready" },
        ],
        drawer: makeDrawer({
          activities: activities("never"),
          costHelp: googleCostHelp,
          credentialFields: providerCredentialFieldsFor("ga4", { connected: false }),
        }),
      },
      {
        id: "plausible",
        kind: "analytics",
        name: "Plausible",
        icon: "chart",
        tint: "#5F5CDE",
        description: "Privacy-friendly site analytics for organic traffic and page performance.",
        status: "ready",
        meta: [
          { labelKey: "siteDomain", valueKey: "notSelected" },
          { labelKey: "apiService", value: "Plausible Cloud" },
          { labelKey: "lastSync", valueKey: "never" },
        ],
        drawer: makeDrawer({
          activities: activities("never"),
          credentialFields: providerCredentialFieldsFor("plausible", { connected: false }),
        }),
      },
    ],
  },
] satisfies readonly IntegrationCategoryFixture[];
