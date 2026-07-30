import type { StatusKind } from "@/components/ui";
import { INTEGRATION_CATEGORY_COPY } from "@/lib/integrations/category-copy";
import { providerCredentialFieldsFor } from "@/lib/integrations/credential-fields";
import { COST_ESTIMATE_PER_CHECK_HELP } from "@/lib/integrations/settings-copy";
import type { ProviderRateData } from "@/lib/integrations/types";
import {
  DEFAULT_SERP_DEPTH,
  DEFAULT_SERP_MARKET,
  type SerpDepth,
  type SerpDevice,
  type SerpMarketName,
} from "@/lib/serp/markets";

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

export type ProviderMetaRow = { label: string; value: string };

export type DrawerDefaults = {
  costPerCheck?: number;
  depth: `Top ${SerpDepth}`;
  device: Capitalize<SerpDevice>;
  endpoint: string;
  language: string;
  location: SerpMarketName;
  login: string;
  primary: boolean;
  secret: string;
};

export type IntegrationProvider = {
  id: string;
  kind: "analytics" | "serp";
  name: string;
  icon: ProviderIconName;
  tint: string;
  description: string;
  status: StatusKind;
  primary?: boolean;
  secondaryAction?: string;
  meta: readonly ProviderMetaRow[];
  drawer: {
    activities: readonly ProviderMetaRow[];
    costHelp: string;
    credentialFields: readonly CredentialField[];
    defaults: DrawerDefaults;
    envHint: string;
    rates?: readonly ProviderRateData[];
  };
};

export type IntegrationCategoryFixture = {
  description: string;
  eyebrow: string;
  id: string;
  providers: readonly IntegrationProvider[];
  title: string;
};

const baseDrawerDefaults: DrawerDefaults = {
  depth: `Top ${DEFAULT_SERP_DEPTH}`,
  device: "Desktop",
  endpoint: "",
  language: "English",
  location: DEFAULT_SERP_MARKET,
  login: "",
  primary: false,
  secret: "",
};

type DrawerInput = Omit<IntegrationProvider["drawer"], "costHelp" | "defaults" | "envHint"> &
  Partial<Pick<IntegrationProvider["drawer"], "costHelp" | "envHint">> & {
    defaults?: Partial<DrawerDefaults>;
  };

const noFailure = { label: "Failed · last error", value: "0 · none" };
const googleCostHelp = `Google API and quota usage stay with your own Google project. ${COST_ESTIMATE_PER_CHECK_HELP}`;

function activities(
  lastLabel: string,
  lastValue: string,
  countLabel: string,
  countValue: string,
): ProviderMetaRow[] {
  return [
    { label: lastLabel, value: lastValue },
    { label: countLabel, value: countValue },
    noFailure,
  ];
}

function makeDrawer(input: DrawerInput): IntegrationProvider["drawer"] {
  return {
    activities: input.activities,
    costHelp: input.costHelp ?? COST_ESTIMATE_PER_CHECK_HELP,
    credentialFields: input.credentialFields,
    defaults: { ...baseDrawerDefaults, ...input.defaults },
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
          { label: "Last rank check", value: "12 min ago" },
          { label: "Est. provider cost", value: "$0.0155 / check" },
        ],
        drawer: makeDrawer({
          activities: activities("Last rank check", "12 min ago", "Checks completed", "248"),
          costHelp: COST_ESTIMATE_PER_CHECK_HELP,
          credentialFields: providerCredentialFieldsFor("dataforseo", { connected: true }),
          defaults: { costPerCheck: 0.0155, login: "team@example.com", primary: true },
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
          ],
        }),
      },
      {
        id: "serpapi",
        kind: "serp",
        name: "SerpAPI",
        icon: "globe",
        tint: "#6B6657",
        description:
          "Alternative SERP provider for rank checks. Keep available for provider switching.",
        status: "ready",
        meta: [
          { label: "Last rank check", value: "Never" },
          { label: "Est. provider cost", value: "Configured by provider" },
        ],
        drawer: makeDrawer({
          activities: activities("Last rank check", "Never", "Checks completed", "0"),
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
          { label: "Last import", value: "6h ago" },
          { label: "Billing", value: "Google API / quota" },
        ],
        drawer: makeDrawer({
          activities: activities("Last import", "6h ago", "Rows imported", "4,812"),
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
          { label: "Last import", value: "Never" },
          { label: "Billing", value: "Google API / quota" },
        ],
        drawer: makeDrawer({
          activities: activities("Last import", "Never", "Rows imported", "0"),
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
          { label: "Site domain", value: "Not selected" },
          { label: "API service", value: "Plausible Cloud" },
          { label: "Last sync", value: "Never" },
        ],
        drawer: makeDrawer({
          activities: activities("Last sync", "Never", "Rows imported", "0"),
          credentialFields: providerCredentialFieldsFor("plausible", { connected: false }),
        }),
      },
    ],
  },
] satisfies readonly IntegrationCategoryFixture[];
