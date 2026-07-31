import type { SerpDepth } from "@/lib/serp/markets";
import type { OrganicResultAnomalyCode } from "./organic-result-decision";

export type OrganicResultGoldenFixture = {
  dataForSeoItems: unknown[];
  depth: SerpDepth;
  expected: {
    anomalyCodes?: OrganicResultAnomalyCode[];
    dataForSeoUrl?: string;
    outcome: "indeterminate" | "match" | "no_match";
    position: number | null;
    serpApiUrl?: string;
    urlKey?: string;
  };
  name: string;
  serpApiResults: unknown[];
};

const boundaryFixtures = ([10, 20, 50, 100] as const).map(
  (position): OrganicResultGoldenFixture => ({
    dataForSeoItems: [
      {
        domain: "example.com",
        rank_absolute: position + 3,
        rank_group: position,
        type: "organic",
        url: `https://example.com/boundary-${position}`,
      },
    ],
    depth: position,
    // biome-ignore format: keep the fixture module under its enforced line cap.
    expected: { dataForSeoUrl: `https://example.com/boundary-${position}`, outcome: "match", position, serpApiUrl: `https://example.com/boundary-${position}`, urlKey: `example.com/boundary-${position}` },
    name: `position exactly ${position}`,
    serpApiResults: [
      {
        displayed_link: "example.com",
        link: `https://example.com/boundary-${position}`,
        position,
      },
    ],
  }),
);

export const organicResultGoldenFixtures: OrganicResultGoldenFixture[] = [
  {
    dataForSeoItems: [
      { rank_absolute: 1, type: "paid" },
      { rank_absolute: 2, type: "featured_snippet" },
      { rank_absolute: 2, type: "people_also_ask" },
      { rank_absolute: 3, type: "local_pack" },
      { rank_absolute: 3, type: "ai_overview" },
      {
        domain: "example.com",
        rank_absolute: 4,
        rank_group: 1,
        type: "organic",
        url: "https://example.com/features",
      },
    ],
    depth: 100,
    // biome-ignore format: keep the fixture module under its enforced line cap.
    expected: { dataForSeoUrl: "https://example.com/features", outcome: "match", position: 1, serpApiUrl: "https://example.com/features", urlKey: "example.com/features" },
    name: "ads and SERP features before organic results",
    serpApiResults: [
      {
        displayed_link: "example.com",
        link: "https://example.com/features",
        position: 1,
      },
    ],
  },
  {
    dataForSeoItems: [
      {
        domain: "example.com",
        rank_absolute: 10,
        rank_group: 8,
        type: "organic",
        url: "https://example.com/later",
      },
      {
        domain: "www.example.com",
        rank_absolute: 4,
        rank_group: 2,
        type: "organic",
        url: "https://www.example.com/best",
      },
    ],
    depth: 100,
    expected: {
      dataForSeoUrl: "https://www.example.com/best",
      outcome: "match",
      position: 2,
      serpApiUrl: "https://www.example.com/best",
      urlKey: "example.com/best",
    },
    name: "minimum across multiple matching URLs",
    serpApiResults: [
      {
        displayed_link: "example.com",
        link: "https://example.com/later",
        position: 8,
      },
      {
        displayed_link: "www.example.com",
        link: "https://www.example.com/best",
        position: 2,
      },
    ],
  },
  {
    dataForSeoItems: [
      {
        domain: "example.com",
        rank_absolute: 1,
        type: "organic",
        url: "https://example.com/unknown-best",
      },
      {
        domain: "example.com",
        rank_group: 4,
        type: "organic",
        url: "https://example.com/known",
      },
    ],
    depth: 100,
    expected: {
      anomalyCodes: ["organic_rank_missing"],
      outcome: "indeterminate",
      position: null,
    },
    name: "malformed matching result prevents accepting a valid matching result",
    serpApiResults: [
      {
        displayed_link: "example.com",
        link: "https://example.com/unknown-best",
      },
      {
        displayed_link: "example.com",
        link: "https://example.com/known",
        position: 4,
      },
    ],
  },
  {
    dataForSeoItems: [
      {
        domain: "example.org",
        rank_group: 1,
        sitelinks: [{ url: "https://example.com/sitelink" }],
        type: "organic",
        url: "https://example.org/parent",
      },
    ],
    depth: 100,
    expected: { outcome: "no_match", position: null },
    name: "tracked domain present only in another result sitelink",
    serpApiResults: [
      {
        displayed_link: "example.org",
        link: "https://example.org/parent",
        position: 1,
        sitelinks: [{ link: "https://example.com/sitelink" }],
      },
    ],
  },
  {
    dataForSeoItems: [
      {
        domain: "example.org",
        rank_group: 1,
        type: "organic",
        url: "https://example.org/only",
      },
    ],
    depth: 100,
    expected: { outcome: "no_match", position: null },
    name: "no match within requested depth",
    serpApiResults: [
      {
        displayed_link: "example.org",
        link: "https://example.org/only",
        position: 1,
      },
    ],
  },
  {
    dataForSeoItems: [
      {
        domain: "example.com",
        rank_absolute: 1,
        type: "organic",
        url: "https://example.com/missing-rank",
      },
    ],
    depth: 100,
    expected: {
      anomalyCodes: ["organic_rank_missing"],
      outcome: "indeterminate",
      position: null,
    },
    name: "matching result without provider organic rank",
    serpApiResults: [
      {
        displayed_link: "example.com",
        link: "https://example.com/missing-rank",
      },
    ],
  },
  {
    dataForSeoItems: [
      {
        domain: "example.org",
        type: "organic",
        url: "https://example.org/malformed",
      },
      {
        domain: "example.com",
        rank_group: 4,
        type: "organic",
        url: "https://example.com/usable",
      },
    ],
    depth: 100,
    expected: {
      anomalyCodes: ["organic_rank_missing"],
      dataForSeoUrl: "https://example.com/usable",
      outcome: "match",
      position: 4,
      serpApiUrl: "https://example.com/usable",
      urlKey: "example.com/usable",
    },
    name: "malformed nonmatching result is skipped",
    serpApiResults: [
      {
        displayed_link: "example.org",
        link: "https://example.org/malformed",
      },
      {
        displayed_link: "example.com",
        link: "https://example.com/usable",
        position: 4,
      },
    ],
  },
  {
    dataForSeoItems: [
      { rank_group: 1, type: "organic" },
      {
        domain: "example.com",
        rank_group: 4,
        type: "organic",
        url: "https://example.com/usable",
      },
    ],
    depth: 100,
    expected: {
      anomalyCodes: ["organic_result_unclassifiable"],
      dataForSeoUrl: "https://example.com/usable",
      outcome: "match",
      position: 4,
      serpApiUrl: "https://example.com/usable",
      urlKey: "example.com/usable",
    },
    name: "unclassifiable result is skipped when a usable result remains",
    serpApiResults: [
      { position: 1 },
      {
        displayed_link: "example.com",
        link: "https://example.com/usable",
        position: 4,
      },
    ],
  },
  {
    dataForSeoItems: [
      {
        domain: "www.example.com",
        rank_group: 3,
        type: "organic",
        url: "https://www.example.com/page/?utm_source=dataforseo#section",
      },
    ],
    depth: 100,
    expected: {
      dataForSeoUrl: "https://www.example.com/page/?utm_source=dataforseo#section",
      outcome: "match",
      position: 3,
      serpApiUrl: "http://example.com/page?utm_source=serpapi",
      urlKey: "example.com/page",
    },
    name: "provider URL strings with equivalent meaning",
    serpApiResults: [
      {
        displayed_link: "example.com",
        link: "http://example.com/page?utm_source=serpapi",
        position: 3,
      },
    ],
  },
  ...boundaryFixtures,
];
