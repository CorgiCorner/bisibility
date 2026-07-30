import { DENSE_CHECK_COUNT } from "./dense-position-series.ts";
import type {
  AcmeKeywordFixture,
  SampleKeywordFixture,
  SampleRankCheckFixture,
  SampleSignalFixture,
} from "./fixture-types";

export type {
  AcmeKeywordFixture,
  SampleKeywordFixture,
  SampleRankCheckFixture,
  SampleSignalFixture,
  SampleTrafficSnapshotFixture,
} from "./fixture-types";

export const acmeTagDefinitions = [
  { color: "var(--green)", name: "Product" },
  { color: "var(--blue)", name: "High intent" },
  { color: "var(--yellow)", name: "Docs" },
  { color: "var(--purple)", name: "Comparison" },
] as const;

// Relative daily dates keep fresh seed data inside the dashboard's 28-day window
// and provide a realistic dense trend.
function checkDate(daysAgo: number): string {
  const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  date.setUTCHours(8, 42, 0, 0);
  return date.toISOString();
}

// DENSE_CHECK_COUNT daily timestamps from 22 days ago through yesterday.
export const acmeCheckDates = Array.from({ length: DENSE_CHECK_COUNT }, (_, index) =>
  checkDate(DENSE_CHECK_COUNT - index),
) as readonly string[];

export const acmeKeywords: readonly AcmeKeywordFixture[] = [
  {
    publicId: "kw_17wdrqp",
    text: "headless cms",
    targetUrl: "https://acme.dev/headless-cms",
    tags: ["Product", "High intent"],
    positions: [6, 5, 4, 3],
  },
  {
    publicId: "kw_0grnhia",
    text: "open source analytics",
    targetUrl: "https://acme.dev/vs/google-analytics",
    tags: ["Comparison"],
    positions: [1, 1, 1, 1],
  },
  {
    publicId: "kw_1oo198z",
    text: "react data grid",
    targetUrl: "https://acme.dev/docs/data-grid",
    tags: ["Docs"],
    positions: [5, 6, 5, 6],
  },
  {
    publicId: "kw_0xjaz0k",
    text: "self hosted seo tool",
    targetUrl: "https://acme.dev/self-host",
    tags: ["Product", "High intent"],
    positions: [5, 4, 3, 2],
  },
  {
    publicId: "kw_06ekos5",
    text: "keyword rank tracker",
    targetUrl: "https://acme.dev/",
    tags: ["Product"],
    positions: [5, 4, 4, 4],
    frequency: "weekly",
    nextCheckAt: "2026-06-25T08:00:00.000Z",
  },
] as const;

const extraSampleKeywords = [
  {
    text: "seo change monitoring",
    targetUrl: "https://acme.dev/features/change-monitoring",
    tags: ["Product"],
    topic: "Monitoring",
    intent: "commercial",
  },
  {
    text: "technical seo dashboard",
    targetUrl: "https://acme.dev/features/technical-seo",
    tags: ["Product", "High intent"],
    topic: "Dashboard",
    intent: "commercial",
  },
  {
    text: "content decay alerts",
    targetUrl: "https://acme.dev/features/content-decay",
    tags: ["Product"],
    topic: "Alerts",
    intent: "informational",
  },
  {
    text: "search visibility tracker",
    targetUrl: "https://acme.dev/features/search-visibility",
    tags: ["High intent"],
    topic: "Visibility",
    intent: "commercial",
  },
  {
    text: "indexing issue monitor",
    targetUrl: "https://acme.dev/docs/indexing",
    tags: ["Docs"],
    topic: "Indexing",
    intent: "informational",
  },
] as const;

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function sampleTargetUrl(item: AcmeKeywordFixture) {
  if (item.text === "open source analytics") return "https://acme.dev/compare/web-analytics";
  return item.targetUrl ?? `https://acme.dev/${slugify(item.text)}`;
}

export const sampleKeywords: readonly SampleKeywordFixture[] = [
  ...acmeKeywords.map((item, index) => ({
    intent: item.tags?.includes("High intent") ? "commercial" : "informational",
    key: `sample_${index + 1}`,
    tags: item.tags ?? [],
    targetUrl: sampleTargetUrl(item),
    text: item.text,
    topic: item.tags?.[0] ?? "Product",
  })),
  ...extraSampleKeywords.map((item, index) => ({ ...item, key: `sample_${index + 6}` })),
] as const;

function seedFor(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.codePointAt(index) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function prng(value: string) {
  let state = seedFor(value);
  return () => {
    state += 0x6d2b79f5;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function utcDay(date: Date, hour = 0) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, 42));
}

function sampleDays(referenceDate: Date) {
  const end = utcDay(referenceDate, 8);
  return Array.from({ length: 30 }, (_, index) => {
    const day = new Date(end);
    day.setUTCDate(end.getUTCDate() - 29 + index);
    return day;
  });
}

function boundedPosition(value: number) {
  return Math.max(1, Math.min(80, value));
}

function targetSeedPosition(keyword: SampleKeywordFixture) {
  const seed = acmeKeywords.find((item) => item.text === keyword.text)?.positions?.at(-1);
  return seed ?? 8 + (seedFor(keyword.text) % 24);
}

function alternateUrls(keyword: SampleKeywordFixture) {
  const slug = slugify(keyword.text);
  return [keyword.targetUrl, `https://acme.dev/resources/${slug}`, `https://acme.dev/blog/${slug}`];
}

function walkKeyword(keyword: SampleKeywordFixture, days: readonly Date[]) {
  const next = prng(keyword.text);
  const urls = alternateUrls(keyword);
  const changeDays = new Set([8 + Math.floor(next() * 7), 18 + Math.floor(next() * 6)]);
  let urlIndex = 0;
  let position = boundedPosition(Math.round(targetSeedPosition(keyword) + 8 - next() * 16));
  const trend = next() > 0.42 ? -1 : 1;

  return days.map((checkedAt, index) => {
    const previousPosition = index === 0 ? null : position;
    if (index > 0) {
      const roll = next();
      let step = 3;
      if (roll < 0.35) step = 0;
      else if (roll < 0.75) step = 1;
      else if (roll < 0.93) step = 2;
      const direction = next() < 0.68 ? trend : -trend;
      position = boundedPosition(position + direction * step);
    }
    const changed = previousPosition !== null && previousPosition !== position;
    if (changed && changeDays.has(index)) {
      urlIndex = (urlIndex + 1) % urls.length;
    }
    return {
      checkedAt,
      key: `${keyword.key}_${checkedAt.toISOString().slice(0, 10)}`,
      keywordKey: keyword.key,
      position,
      previousPosition,
      rankingUrl: urls[urlIndex],
    };
  });
}

function signalSeverity(before: number, after: number) {
  return after > before ? "warning" : "info";
}

function signalsFor(checks: readonly SampleRankCheckFixture[]) {
  const signals: SampleSignalFixture[] = [];
  for (let index = 1; index < checks.length; index += 1) {
    const before = checks[index - 1];
    const after = checks[index];
    if (before.position === after.position) continue;
    signals.push({
      happenedAt: after.checkedAt,
      key: `${after.key}_ranking`,
      keywordKey: after.keywordKey,
      payload: {
        after: after.position,
        before: before.position,
        delta: before.position - after.position,
        rankCheckId: after.key,
      },
      rankCheckKey: after.key,
      severity: signalSeverity(before.position, after.position),
      type: "ranking.changed",
      url: after.rankingUrl,
    });
    if (before.rankingUrl !== after.rankingUrl) {
      signals.push({
        happenedAt: after.checkedAt,
        key: `${after.key}_url`,
        keywordKey: after.keywordKey,
        payload: {
          after: after.rankingUrl,
          before: before.rankingUrl,
          matchesTargetUrl:
            after.rankingUrl ===
            sampleKeywords.find((item) => item.key === after.keywordKey)?.targetUrl,
        },
        rankCheckKey: after.key,
        severity: "info",
        type: "ranking_url.changed",
        url: after.rankingUrl,
      });
    }
  }
  return signals;
}

function ctrFor(position: number) {
  if (position === 1) return 0.28;
  if (position <= 3) return 0.14;
  if (position <= 10) return 0.055;
  if (position <= 20) return 0.018;
  return 0.006;
}

function trafficFor(keyword: SampleKeywordFixture, checks: readonly SampleRankCheckFixture[]) {
  const next = prng(`${keyword.text}:traffic`);
  const base = 420 + (seedFor(keyword.text) % 900);
  return checks.map((check, index) => {
    const impressions = Math.max(40, Math.round(base * (1 + index / 140) * (0.92 + next() * 0.18)));
    const ctr = Math.round(ctrFor(check.position) * (0.88 + next() * 0.24) * 10000) / 10000;
    return {
      clicks: Math.max(0, Math.round(impressions * ctr)),
      ctr,
      date: utcDay(check.checkedAt),
      impressions,
      keywordKey: keyword.key,
      position: Math.round((check.position + (next() - 0.5) * 0.6) * 10) / 10,
      windowDays: 28 as const,
    };
  });
}

export function buildSampleDataset(referenceDate: Date) {
  const days = sampleDays(referenceDate);
  const checksByKeyword = sampleKeywords.map((keyword) => walkKeyword(keyword, days));
  const rankChecks = checksByKeyword.flat();
  return {
    keywords: sampleKeywords,
    rankChecks,
    signals: checksByKeyword.flatMap(signalsFor),
    tags: acmeTagDefinitions,
    trafficSnapshots: sampleKeywords.flatMap((keyword, index) =>
      trafficFor(keyword, checksByKeyword[index]),
    ),
  };
}
