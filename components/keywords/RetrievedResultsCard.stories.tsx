import { RetrievedResultsCard } from "@/components/keywords/RetrievedResultsCard";
import type { RetrievedResults, StoredResultsIndexEntry } from "@/lib/checks/contract";
import type { Meta, StoryObj } from "@storybook/react";

type Full = Extract<RetrievedResults, { tier: "full" }>;

const AUG = "2026-08-02T06:00:00.000Z";
const JUL = "2026-07-26T06:00:00.000Z";
const APR = "2026-04-12T06:00:00.000Z";
const FEB = "2026-02-09T06:00:00.000Z";

function ladderRows(trackedAt: number, depth: number) {
  return Array.from({ length: trackedAt }, (_, index) => ({
    domain: index + 1 === trackedAt ? "example.com" : `sub${index + 1}.example.org`,
    position: index + 1,
    title:
      index + 1 === trackedAt
        ? "Open source analytics, compared"
        : `Alternative ${index + 1} for analytics`,
    tracked: index + 1 === trackedAt,
    url:
      index + 1 === trackedAt
        ? "https://example.com/vs/hosted-analytics"
        : `https://sub${index + 1}.example.org/post`,
  })).slice(0, Math.min(trackedAt, depth));
}

function full(trackedAt: number, overrides: Partial<Full> = {}): Full {
  return {
    aiOverview: true,
    checkId: "chk_aug02",
    checkedAt: AUG,
    features: ["ai overview", "people also ask", "video"],
    fullDetailUntil: "2026-10-31T06:00:00.000Z",
    provider: "dataforseo",
    providerLabel: "DataForSEO",
    requestedDepth: 100,
    retrievedPositions: trackedAt,
    rows: ladderRows(trackedAt, 100),
    stoppedAtResult: true,
    tier: "full",
    trackedPosition: trackedAt,
    ...overrides,
  };
}

function entry(overrides: Partial<StoredResultsIndexEntry> = {}): StoredResultsIndexEntry {
  return {
    checkId: "chk_aug02",
    checkedAt: AUG,
    degradedToCountry: false,
    fullDetailUntil: "2026-10-31T06:00:00.000Z",
    position: 22,
    provider: "dataforseo",
    providerLabel: "DataForSEO",
    requestedDepth: 100,
    retrievedPositions: 22,
    stoppedAtResult: true,
    tier: "full",
    ...overrides,
  };
}

const olderEntry = entry({
  checkId: "chk_jul26",
  checkedAt: JUL,
  fullDetailUntil: "2026-10-24T06:00:00.000Z",
  position: 26,
  retrievedPositions: 26,
});

const meta = {
  component: RetrievedResultsCard,
  parameters: { layout: "padded" },
  title: "Keywords/RetrievedResultsCard",
} satisfies Meta<typeof RetrievedResultsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

function args(entries: StoredResultsIndexEntry[], results: RetrievedResults, days: number | null) {
  return {
    entries,
    initialResults: results,
    loadResults: async () => [results],
    rankingUrl: "/vs/hosted-analytics",
    retentionDays: days,
    timeZone: "UTC",
  };
}

/** The landing case: a #1 result, one retrieved row, and 99 positions never asked for. */
export const ExtremeShallow: Story = {
  args: args([entry({ position: 1, retrievedPositions: 1 })], full(1), 90),
};

export const Deep: Story = { args: args([entry()], full(22), 90) };

export const NotFound: Story = {
  args: args(
    [entry({ position: null, retrievedPositions: 100 })],
    full(100, {
      aiOverview: false,
      retrievedPositions: 100,
      rows: ladderRows(100, 100).map((row) => ({ ...row, domain: "example.org", tracked: false })),
      stoppedAtResult: false,
      trackedPosition: null,
    }),
    90,
  ),
};

export const SelfHostUnlimitedRetention: Story = {
  args: args([entry({ fullDetailUntil: null })], full(22, { fullDetailUntil: null }), null),
};

export const ProviderCannotReportAiOverview: Story = {
  args: args(
    [entry({ provider: "serpapi", providerLabel: "SerpApi" })],
    full(22, {
      aiOverview: null,
      features: ["answer box", "related questions"],
      provider: "serpapi",
      providerLabel: "SerpApi",
    }),
    90,
  ),
};

export const Compact: Story = {
  args: args(
    [entry({ checkId: "chk_apr12", checkedAt: APR, retrievedPositions: null, tier: "compact" })],
    {
      checkId: "chk_apr12",
      checkedAt: APR,
      domains: [
        { bestPosition: 1, domain: "sub1.example.org" },
        { bestPosition: 4, domain: "sub2.example.org" },
        { bestPosition: 40, domain: "example.com" },
      ],
      expiredAt: "2026-07-11T06:00:00.000Z",
      provider: "dataforseo",
      providerLabel: "DataForSEO",
      tier: "compact",
    },
    90,
  ),
};

export const Unavailable: Story = {
  args: args(
    [
      entry({
        checkId: "chk_feb09",
        checkedAt: FEB,
        fullDetailUntil: null,
        position: null,
        retrievedPositions: null,
        tier: "none",
      }),
    ],
    {
      checkId: "chk_feb09",
      checkedAt: FEB,
      provider: "dataforseo",
      providerLabel: "DataForSEO",
      tier: "none",
    },
    90,
  ),
};

/** Two full checks in the picker, so Compare two has something to line up. */
export const ComparisonAvailable: Story = {
  args: args([entry(), olderEntry], full(22), 90),
};

const SCREENSHOT_CURRENT: Full = {
  aiOverview: false,
  checkId: "screenshot-current",
  checkedAt: "2026-03-12T06:00:00.000Z",
  features: ["answer box", "related questions", "sitelinks", "video"],
  fullDetailUntil: "2026-06-10T06:00:00.000Z",
  provider: "dataforseo",
  providerLabel: "DataForSEO",
  requestedDepth: 100,
  retrievedPositions: 8,
  rows: [
    [1, "contentful.com", "What is a headless CMS?"],
    [2, "strapi.io", "Strapi - Open source headless CMS"],
    [3, "sanity.io", "Sanity - the composable content cloud"],
    [4, "acme.dev", "Headless CMS for product teams - Acme"],
    [5, "storyblok.com", "Storyblok: the enterprise headless CMS"],
    [6, "hygraph.com", "Hygraph - GraphQL-native headless CMS"],
    [7, "en.wikipedia.org", "Headless content management system"],
    [8, "reddit.com", "Best headless CMS platforms"],
  ].map(([position, domain, title]) => ({
    domain: String(domain),
    position: Number(position),
    title: String(title),
    tracked: domain === "acme.dev",
    url: `https://${domain}${domain === "acme.dev" ? "/headless-cms" : ""}`,
  })),
  stoppedAtResult: true,
  tier: "full",
  trackedPosition: 4,
};
const SCREENSHOT_OLDER: Full = {
  ...SCREENSHOT_CURRENT,
  checkId: "screenshot-older",
  checkedAt: "2026-03-05T06:00:00.000Z",
  provider: "serpapi",
  providerLabel: "SerpApi",
  rows: SCREENSHOT_CURRENT.rows.map((row) => ({
    ...row,
    position: row.domain === "acme.dev" ? 6 : row.position,
    tracked: row.domain === "acme.dev",
  })),
  trackedPosition: 6,
};
const screenshotEntries: StoredResultsIndexEntry[] = [
  entry({
    checkId: SCREENSHOT_CURRENT.checkId,
    checkedAt: SCREENSHOT_CURRENT.checkedAt,
    position: 4,
    retrievedPositions: 8,
  }),
  entry({
    checkId: SCREENSHOT_OLDER.checkId,
    checkedAt: SCREENSHOT_OLDER.checkedAt,
    position: 6,
    provider: "serpapi",
    providerLabel: "SerpApi",
    retrievedPositions: 8,
  }),
];

export const ScreenshotOneCheck: Story = {
  args: {
    ...args(screenshotEntries, SCREENSHOT_CURRENT, 90),
    loadResults: async (ids) =>
      [SCREENSHOT_CURRENT, SCREENSHOT_OLDER].filter((result) => ids.includes(result.checkId)),
    rankingUrl: "acme.dev/headless-cms",
  },
  parameters: { chromatic: { viewports: [390, 1024] } },
};

export const ScreenshotCompareTwo: Story = {
  args: ScreenshotOneCheck.args,
  parameters: { chromatic: { viewports: [390, 1024] } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Compare two" }));
  },
};
