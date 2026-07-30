export type {
  DefaultsData,
  KeywordSchedule,
  ProviderSummaryData,
  ProviderUsageData,
  RankCheckFrequency,
} from "@/lib/settings/options";

export const settingsFixtures = {
  project: {
    name: "acme.dev SEO",
    domain: "acme.dev",
    projectId: "prj_7Kd2Qf9m",
  },
  defaults: {
    city: null,
    country: "United States",
    device: "Desktop",
    keywordCount: 248,
    inspectionDailyLimit: 50,
    locationKey: "US",
    locationLabel: "United States",
    locationCount: 1,
    serpDepth: 100,
    serpStopOnMatch: true,
    deviceCount: 1,
    costPerCheck: 0.0155,
    schedule: {
      frequency: "daily",
      cron_expression: "0 6 * * *",
      timezone: "Europe/Warsaw",
      jitter_minutes: 60,
      last_checked_at: "2026-06-18T10:12:00.000Z",
      next_check_at: "2026-06-19T06:00:00.000Z",
    },
    targetUrlCount: 120,
  },
  providers: [
    {
      icon: "database",
      logoDomain: "dataforseo.com",
      name: "DataForSEO",
      detail: "SERP rank data · $0.0155 / check",
      status: "connected",
      primary: true,
      tint: "accent",
    },
    {
      icon: "magnifier",
      logoDomain: "google.com",
      name: "Google Search Console",
      detail: "Clicks & impressions · Free",
      status: "connected",
      tint: "blue",
    },
  ],
  apiKeys: [
    {
      id: "key_production",
      isExpired: false,
      name: "Production",
      maskedValue: "bsb_key_live_******4f2a",
      createdLabel: "created Apr 2",
      expiresLabel: "expires Oct 24",
      lastUsedLabel: "last used 6 min ago",
    },
    {
      id: "key_ci",
      isExpired: false,
      name: "CI / GitHub Actions",
      maskedValue: "bsb_key_live_******9c01",
      createdLabel: "created Mar 18",
      expiresLabel: "never expires",
      lastUsedLabel: "last used 2d ago",
    },
  ],
  notifications: {
    channel: "Email",
    digest: "Daily",
    email: "demo@acme.dev",
    emailVerification: "verified",
    maxAlertsPerDay: 20,
  },
  tags: [
    { color: "var(--blue)", count: 84, label: "high-intent" },
    { color: "var(--green)", count: 62, label: "product" },
    { color: "var(--yellow)", count: 31, label: "docs" },
    { color: "var(--purple)", count: 18, label: "comparison" },
  ],
  usage: {
    // Mirrors HANDOFF-35 artboard 1E: $12.40 spent of a $50.00 cap, two providers.
    budget: { capCents: 5000, spentCents: 1240 },
    connections: [
      {
        connectionId: "conn_dataforseo",
        costPerCheck: "$0.0006",
        lookups: { costCents: 494, count: 14 },
        primary: true,
        provider: "DataForSEO",
        rankChecks: { costCents: 446, count: 7440 },
      },
      {
        connectionId: "conn_serpapi",
        costPerCheck: "$0.0200",
        lookups: null,
        primary: false,
        provider: "SerpAPI",
        rankChecks: { costCents: 300, count: 150 },
      },
    ],
    serpChecksMonth: "7,442",
    primaryProvider: "DataForSEO",
    hasProvider: true,
    onPaceCents: 1750,
  },
  team: [
    {
      id: "jan",
      initials: "AK",
      name: "Alex Kim",
      email: "demo@acme.dev",
      role: "Owner",
      color: "accent",
    },
    {
      id: "maria",
      initials: "SR",
      name: "Sam Rivera",
      email: "maria@acme.dev",
      role: "Editor",
      color: "blue",
    },
    {
      id: "piotr",
      initials: "JT",
      name: "Jordan Taylor",
      email: "piotr@acme.dev",
      role: "Viewer",
      color: "purple",
    },
  ],
} as const;

/** Pinned visual-review totals must match the usage connection fixture above. */
export const usageProviderSpend = [
  { label: "DataForSEO", spentCents: 940 },
  { label: "SerpAPI", spentCents: 300 },
] as const;
