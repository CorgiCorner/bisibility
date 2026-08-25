import { RetrievedResultsCompare } from "@/components/keywords/RetrievedResultsCompare";
import type { RetrievedResults } from "@/lib/checks/contract";
import type { Meta, StoryObj } from "@storybook/react";

type Full = Extract<RetrievedResults, { tier: "full" }>;
type Compact = Extract<RetrievedResults, { tier: "compact" }>;

function fullResults(overrides: Partial<Full> = {}): Full {
  return {
    checkId: "c1",
    checkedAt: "2025-07-01T00:00:00Z",
    provider: "dataforseo",
    providerLabel: "DataForSEO",
    tier: "full",
    requestedDepth: 10,
    retrievedPositions: 10,
    trackedPosition: null,
    stoppedAtResult: false,
    rows: [],
    features: [],
    aiOverview: null,
    fullDetailUntil: null,
    ...overrides,
  };
}

function row(position: number, domain: string) {
  return { position, domain, url: null, title: null, tracked: false };
}

const meta = {
  title: "Keywords/RetrievedResultsCompare",
  component: RetrievedResultsCompare,
  parameters: { chromatic: { viewports: [390, 768, 1440] } },
} satisfies Meta<typeof RetrievedResultsCompare>;

export default meta;

type Story = StoryObj<typeof meta>;

export const List: Story = {
  args: {
    from: fullResults({
      checkId: "c1",
      checkedAt: "2025-07-01T00:00:00Z",
      rows: [
        row(1, "example.com"),
        row(2, "example.org"),
        row(3, "blog.example.com"),
        row(4, "docs.example.org"),
        row(5, "shop.example.com"),
      ],
    }),
    to: fullResults({
      checkId: "c2",
      checkedAt: "2025-07-08T00:00:00Z",
      rows: [
        row(1, "blog.example.com"),
        row(2, "example.com"),
        row(3, "new.example.org"),
        row(4, "example.org"),
        row(5, "shop.example.com"),
      ],
    }),
    timeZone: "UTC",
    fullCheckDates: ["2025-07-01", "2025-07-08"],
  },
};

export const Degenerate: Story = {
  args: {
    from: fullResults({
      checkId: "c1",
      checkedAt: "2025-07-01T00:00:00Z",
      rows: [row(1, "example.com")],
      retrievedPositions: 2,
    }),
    to: fullResults({
      checkId: "c2",
      checkedAt: "2025-07-08T00:00:00Z",
      rows: [row(1, "example.com")],
      retrievedPositions: 2,
    }),
    timeZone: "UTC",
    fullCheckDates: ["2025-07-01", "2025-07-08"],
  },
};

export const Refused: Story = {
  args: {
    from: {
      checkId: "c1",
      checkedAt: "2025-01-01T00:00:00Z",
      provider: "dataforseo",
      providerLabel: "DataForSEO",
      tier: "compact",
      domains: [{ domain: "example.com", bestPosition: 1 }],
      expiredAt: null,
    } satisfies Compact,
    to: fullResults({
      checkId: "c2",
      checkedAt: "2025-07-08T00:00:00Z",
      rows: [row(1, "example.com")],
    }),
    timeZone: "UTC",
    fullCheckDates: ["2025-07-01", "2025-07-08"],
    fullPair: { from: "c-old", to: "c2" },
    onPickFullPair: () => {},
  },
};
