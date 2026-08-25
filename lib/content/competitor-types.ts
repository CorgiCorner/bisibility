import {
  type FeatureKey,
  type FeatureStatus,
  type FeatureStatusEntry,
  featureStatus,
} from "./feature-status";

export type CompareStatus = "yes" | "no" | "free" | "paid" | "addon" | "conditional" | "na";

export type CompareCell = {
  status: CompareStatus;
  label?: string;
};

export const COMPARE_GROUPS = [
  "Hosting and ownership",
  "Data access and export",
  "Automation and integrations",
  "Product scope",
] as const;

export type CompareGroup = (typeof COMPARE_GROUPS)[number];

export const COMPARE_CRITERIA = {
  selfHosting: { label: "Self-hosting", group: "Hosting and ownership" },
  customerDatabase: { label: "Database you operate", group: "Hosting and ownership" },
  directSql: { label: "Direct SQL access", group: "Hosting and ownership" },
  fullHistoryExport: { label: "Full history export", group: "Data access and export" },
  rawSerpPayload: { label: "Raw SERP payload", group: "Data access and export" },
  api: { label: "API access", group: "Automation and integrations" },
  providerPortability: { label: "SERP provider choice", group: "Automation and integrations" },
  selfHostedLicense: { label: "Self-hosted license", group: "Hosting and ownership" },
  serpData: { label: "SERP data billing", group: "Data access and export" },
  infrastructure: { label: "Infrastructure operator", group: "Hosting and ownership" },
  hostedPlan: { label: "Hosted plan", group: "Hosting and ownership" },
  seats: { label: "Team seats", group: "Automation and integrations" },
} as const satisfies Record<string, { group: CompareGroup; label: string }>;

export const ALTERNATIVES_SUMMARY_SECTIONS = [
  {
    heading: "Hosting and ownership",
    criteria: [
      COMPARE_CRITERIA.selfHosting,
      COMPARE_CRITERIA.customerDatabase,
      COMPARE_CRITERIA.directSql,
    ],
  },
  {
    heading: "Data access and export",
    criteria: [COMPARE_CRITERIA.fullHistoryExport, COMPARE_CRITERIA.rawSerpPayload],
  },
  {
    heading: "Automation and integrations",
    criteria: [COMPARE_CRITERIA.api, COMPARE_CRITERIA.providerPortability],
  },
] as const satisfies readonly {
  heading: CompareGroup;
  criteria: readonly { group: CompareGroup; label: string }[];
}[];

export type CompareRow = {
  label: string;
  bisibility: CompareCell;
  competitor: CompareCell;
  group?: CompareGroup;
  invert?: boolean;
};

export type CompetitorFaq = {
  question: string;
  answer: string;
};

export type CompetitorSource = {
  label: string;
  href: string;
};

export type ProviderComparison = {
  heading: string;
  intro: string;
  columns: readonly [string, string, string];
  rows: readonly {
    label: string;
    values: readonly [string, string, string];
  }[];
};

export type EntityFirstContent = {
  title: string;
  metaDescription: string;
  h1: string;
  intro: readonly string[];
  alternateNames: readonly string[];
  sameAs: readonly string[];
  datePublished: string;
  providerComparison?: ProviderComparison;
};

export type CompetitorContent = {
  slug: string;
  name: string;
  domain: string;
  licenseUrl?: string;
  monogram: string;
  tint: string;
  tagline: string;
  category: string;
  lead: string;
  indexDetails: {
    bestFor: string;
    hosting: string;
    rankUpdates: string;
    tradeOff: string;
  };
  verdict: string;
  verdictPair: {
    competitor: string;
    bisibility: string;
  };
  strengths: readonly string[];
  limitations: readonly string[];
  row: CompareRow[];
  whyBisibility: readonly string[];
  switchingLosses: readonly string[];
  switchingGains: readonly string[];
  migration: string;
  faq: readonly CompetitorFaq[];
  lastVerified: string;
  sources: readonly CompetitorSource[];
  entityFirst?: EntityFirstContent;
};

export const cell = (status: CompareStatus, label?: string): CompareCell => ({ status, label });

const STATUS_LABEL: Record<FeatureStatus, string> = {
  shipped: "Yes",
  beta: "Beta",
  "open-beta": "Open beta",
  building: "In development",
  planned: "Planned",
  exploring: "On the roadmap",
  "cloud-only": "Hosted only",
  "not-planned": "Not planned",
};

export function featureCell(key: FeatureKey, label?: string): CompareCell {
  const feature: FeatureStatusEntry = featureStatus[key];
  const status = feature.status;
  if (status === "shipped") {
    return cell("yes", feature.scope === "self-host" ? "Yes - self-hosted" : label);
  }
  if (status === "planned") return cell("conditional", label ?? STATUS_LABEL.planned);
  return cell("conditional", label ?? STATUS_LABEL[status]);
}

export function compareRows(opts: {
  seats: CompareCell;
  api: CompareCell;
  hostedPlan: string;
  selfHosting?: CompareCell;
  customerDatabase?: CompareCell;
  directSql?: CompareCell;
  fullHistoryExport?: CompareCell;
  rawSerpPayload?: CompareCell;
  providerPortability?: CompareCell;
  selfHostedLicense?: CompareCell;
  serpData?: CompareCell;
  infrastructure?: CompareCell;
  extras?: CompareRow[];
  wins?: CompareRow[];
}): CompareRow[] {
  return [
    {
      ...COMPARE_CRITERIA.selfHosting,
      bisibility: featureCell("selfHosting"),
      competitor: opts.selfHosting ?? cell("no"),
    },
    {
      ...COMPARE_CRITERIA.customerDatabase,
      bisibility: featureCell("customerDatabase"),
      competitor: opts.customerDatabase ?? cell("no"),
    },
    {
      ...COMPARE_CRITERIA.directSql,
      bisibility: featureCell("directSql"),
      competitor: opts.directSql ?? cell("no"),
    },
    {
      ...COMPARE_CRITERIA.fullHistoryExport,
      bisibility: featureCell("fullHistoryExport", "Project package, CSV, and REST API"),
      competitor: opts.fullHistoryExport ?? cell("conditional", "Plan-dependent"),
    },
    {
      ...COMPARE_CRITERIA.rawSerpPayload,
      bisibility: featureCell("rawSerpPayload"),
      competitor: opts.rawSerpPayload ?? cell("no"),
    },
    {
      ...COMPARE_CRITERIA.api,
      bisibility: featureCell("restApi", "REST API v1, OpenAPI, SDKs, CLI, MCP"),
      competitor: opts.api,
    },
    {
      ...COMPARE_CRITERIA.providerPortability,
      bisibility: featureCell("providerPortability", "DataForSEO or SerpApi, with fallback"),
      competitor: opts.providerPortability ?? cell("no", "Bundled provider"),
    },
    {
      ...COMPARE_CRITERIA.selfHostedLicense,
      bisibility: cell("free", "$0 / AGPL-3.0"),
      competitor: opts.selfHostedLicense ?? cell("na", "Not available"),
    },
    {
      ...COMPARE_CRITERIA.serpData,
      bisibility: cell("paid", "Paid directly to provider"),
      competitor: opts.serpData ?? cell("paid", "Bundled"),
    },
    {
      ...COMPARE_CRITERIA.infrastructure,
      bisibility: cell("paid", "You, or bisibility on the hosted beta"),
      competitor: opts.infrastructure ?? cell("paid", "Managed"),
    },
    {
      ...COMPARE_CRITERIA.hostedPlan,
      bisibility: featureCell("hostedCloud", "Open beta"),
      competitor: cell("paid", opts.hostedPlan),
    },
    {
      ...COMPARE_CRITERIA.seats,
      bisibility: featureCell("teamRoles", "Owner, Admin, Editor, Viewer"),
      competitor: opts.seats,
    },
    ...(opts.extras ?? []).map((row) => ({
      ...row,
      group: row.group ?? ("Automation and integrations" as const),
    })),
    ...(opts.wins ?? []).map((row) => ({
      ...row,
      group: row.group ?? ("Product scope" as const),
    })),
  ];
}
