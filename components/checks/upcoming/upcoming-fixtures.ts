import type { UpcomingView } from "@/lib/checks/contract";

export const upcomingNow = new Date("2026-07-24T12:00:00.000Z");

const days: UpcomingView["days"] = [
  {
    count: 214,
    estimatedCostCents: 45,
    key: "2026-07-24",
    label: "Today",
    samples: [
      {
        frequency: "daily",
        keyword: "flow dictation app",
        keywordId: "keyword-1",
        keywordPublicId: "kw_flow_dictation",
        nextCheckAt: "2026-07-24T14:17:00.000Z",
      },
      {
        frequency: "daily",
        keyword: "ai meeting notes",
        keywordId: "keyword-2",
        keywordPublicId: "kw_meeting_notes",
        nextCheckAt: "2026-07-24T14:41:00.000Z",
      },
      {
        frequency: "custom_cron",
        keyword: "voice typing chrome",
        keywordId: "keyword-3",
        keywordPublicId: "kw_voice_typing",
        nextCheckAt: "2026-07-24T17:08:00.000Z",
      },
      {
        frequency: "daily",
        keyword: "hidden fourth sample",
        keywordId: "keyword-4",
        keywordPublicId: "kw_hidden_sample",
        nextCheckAt: "2026-07-24T18:26:00.000Z",
      },
    ],
  },
  {
    count: 1190,
    estimatedCostCents: 260,
    key: "2026-07-25",
    label: "Tomorrow",
    samples: [
      {
        frequency: "daily",
        keyword: "example",
        keywordId: "keyword-5",
        keywordPublicId: "kw_example",
        nextCheckAt: "2026-07-25T07:37:00.000Z",
      },
      {
        frequency: "weekly",
        keyword: "open source rank tracker",
        keywordId: "keyword-6",
        keywordPublicId: "kw_open_source",
        nextCheckAt: "2026-07-25T10:23:00.000Z",
      },
    ],
  },
  {
    count: 1204,
    estimatedCostCents: 263,
    key: "2026-07-26",
    label: "Sun 26 Jul",
    samples: [
      {
        frequency: "weekly",
        keyword: "seo monitoring",
        keywordId: "keyword-7",
        keywordPublicId: "kw_seo_monitoring",
        nextCheckAt: "2026-07-26T06:52:00.000Z",
      },
    ],
  },
];

const forecast: NonNullable<UpcomingView["forecast"]> = {
  capCents: 5000,
  capLastsUntil: "2026-08-08",
  next48hCents: 530,
  spentCents: 1820,
};

export const upcomingViewFixture: UpcomingView = {
  blocked: [
    { keywordCount: 2, reason: "no_provider" },
    { keywordCount: 1, reason: "migration_hold" },
    { keywordCount: 4, reason: "budget_exhausted" },
  ],
  days,
  forecast,
  providerSummary: "DataForSEO +1 fallback",
  timeZone: "Europe/Warsaw",
};

export const upcomingNoProviderView: UpcomingView = {
  ...upcomingViewFixture,
  blocked: [{ keywordCount: 2, reason: "no_provider" }],
};

export const upcomingUnblockedView: UpcomingView = {
  ...upcomingViewFixture,
  blocked: [],
};

export const emptyUpcomingView: UpcomingView = {
  blocked: [],
  days: [],
  forecast: null,
  providerSummary: "No provider connected",
  timeZone: "Europe/Warsaw",
};
