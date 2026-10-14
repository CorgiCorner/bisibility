import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { RetrievedResults, StoredResultsIndexEntry } from "@/lib/checks/contract";
import { vi } from "vitest";
import { RetrievedResultsCard } from "./RetrievedResultsCard";

export const CHECK_ID = "chk_aug02";
export const OLDER_ID = "chk_jul26";

export function entry(overrides: Partial<StoredResultsIndexEntry> = {}): StoredResultsIndexEntry {
  return {
    checkId: CHECK_ID,
    checkedAt: "2026-08-02T06:00:00.000Z",
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

export function fullResults(overrides: Partial<Extract<RetrievedResults, { tier: "full" }>> = {}) {
  const rows = Array.from({ length: 22 }, (_, index) => ({
    domain: index === 21 ? "example.com" : `sub${index}.example.org`,
    position: index + 1,
    title: `Result ${index + 1}`,
    tracked: index === 21,
    url: index === 21 ? "https://example.com/compare" : `https://sub${index}.example.org/page`,
  }));
  return {
    rankingUrl: "/compare",
    aiOverview: true,
    checkId: CHECK_ID,
    checkedAt: "2026-08-02T06:00:00.000Z",
    features: ["ai overview", "people also ask"],
    fullDetailUntil: "2026-10-31T06:00:00.000Z",
    provider: "dataforseo",
    providerLabel: "DataForSEO",
    requestedDepth: 100,
    retrievedPositions: 22,
    rows,
    stoppedAtResult: true,
    tier: "full" as const,
    trackedPosition: 22,
    ...overrides,
  };
}

export function screenshotRows() {
  return [
    {
      domain: "contentful.com",
      position: 1,
      title: "What is a headless CMS?",
      tracked: false,
      url: "https://contentful.com",
    },
    {
      domain: "strapi.io",
      position: 2,
      title: "Strapi - Open source headless CMS",
      tracked: false,
      url: "https://strapi.io",
    },
    {
      domain: "sanity.io",
      position: 3,
      title: "Sanity - the composable content cloud",
      tracked: false,
      url: "https://sanity.io",
    },
    {
      domain: "acme.dev",
      position: 4,
      title: "Headless CMS for product teams - Acme",
      tracked: true,
      url: "https://acme.dev/headless-cms",
    },
    {
      domain: "storyblok.com",
      position: 5,
      title: "Storyblok: the enterprise headless CMS",
      tracked: false,
      url: "https://storyblok.com",
    },
    {
      domain: "hygraph.com",
      position: 6,
      title: "Hygraph - GraphQL-native headless CMS",
      tracked: false,
      url: "https://hygraph.com",
    },
    {
      domain: "en.wikipedia.org",
      position: 7,
      title: "Headless content management system",
      tracked: false,
      url: "https://en.wikipedia.org/wiki/Headless_content_management_system",
    },
  ];
}

export function renderCard(
  entries: StoredResultsIndexEntry[],
  results: RetrievedResults,
  retentionDays: number | null = 90,
) {
  const loadResults = vi.fn(async () => [results]);
  render(
    <RetrievedResultsCard
      entries={entries}
      initialResults={results}
      loadResults={loadResults}
      rankingUrl="/compare"
      retentionDays={retentionDays}
      timeZone="UTC"
    />,
  );
  return { loadResults };
}
