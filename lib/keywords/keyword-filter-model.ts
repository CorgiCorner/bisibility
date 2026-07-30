import { hasUrlMismatch } from "@/lib/alerts/url-mismatch";
import type { KeywordRow } from "@/lib/queries/keywords";

export type PositionBucketId = "top3" | "top10" | "11-50" | "51-100";
export type ChangeFilter = "any" | "up" | "down" | "new" | "lost";
export type LastCheckFilter = "any" | "completed" | "failed" | "running";

export type KeywordFilters = {
  position: PositionBucketId[];
  change: ChangeFilter;
  volMin: number;
  volMax: number;
  contains: string;
  tags: string[];
  topics: string[];
  intents: string[];
  serp: string[];
  lastCheck: LastCheckFilter;
  wrongUrl: boolean;
  urlChanged: boolean;
};

export type KeywordFilterChip = { key: string; label: string };

export const emptyKeywordFilters: KeywordFilters = {
  change: "any",
  contains: "",
  intents: [],
  lastCheck: "any",
  position: [],
  serp: [],
  tags: [],
  topics: [],
  volMax: 50,
  volMin: 0,
  wrongUrl: false,
  urlChanged: false,
};

export const defaultKeywordFilters: KeywordFilters = {
  ...emptyKeywordFilters,
  position: ["top10"],
  tags: ["High intent"],
};

export const positionBuckets = [
  { id: "top3", label: "Top 3" },
  { id: "top10", label: "Top 10" },
  { id: "11-50", label: "11-50" },
  { id: "51-100", label: "51-100" },
] as const;

export const changeOptions = [
  { id: "any", label: "Any" },
  { id: "up", label: "Improved" },
  { id: "down", label: "Dropped" },
  { id: "new", label: "New" },
  { id: "lost", label: "Lost" },
] as const;

export const lastCheckOptions = [
  { id: "any", label: "Any" },
  { id: "failed", label: "Failed" },
  { id: "running", label: "Running" },
  { id: "completed", label: "Completed" },
] as const;

export const serpFeatures = [
  { id: "featured", label: "Featured snippet" },
  { id: "paa", label: "People also ask" },
  { id: "sitelinks", label: "Sitelinks" },
  { id: "image", label: "Image pack" },
  { id: "video", label: "Video" },
  { id: "ai", label: "AI overview" },
] as const;

const serpAliases: Record<string, string[]> = {
  featured: ["snippet", "featured"],
  image: ["image", "images"],
  paa: ["people", "paa"],
  sitelinks: ["sitelinks"],
  video: ["video"],
  ai: ["ai"],
};

function inPositionBucket(position: number, bucket: PositionBucketId) {
  if (bucket === "top3") {
    return position <= 3;
  }
  if (bucket === "top10") {
    return position <= 10;
  }
  if (bucket === "11-50") {
    return position > 10 && position <= 50;
  }
  return position > 50 && position <= 100;
}

function matchesChange(row: KeywordRow, change: ChangeFilter) {
  if (change === "any") {
    return true;
  }
  if (change === "up") {
    return row.positionBaseline !== null && row.positionBaseline > row.position;
  }
  if (change === "down") {
    return row.positionBaseline !== null && row.positionBaseline < row.position;
  }
  if (change === "new") {
    return (row.positionBaseline === null || row.positionBaseline > 100) && row.position <= 100;
  }
  return row.positionBaseline !== null && row.positionBaseline <= 100 && row.position > 100;
}

export function matchesKeywordSearch(row: KeywordRow, searchValue: string) {
  const query = searchValue.trim().toLowerCase();
  if (!query) {
    return true;
  }
  return [
    row.keyword,
    row.id,
    row.rankingPath,
    row.targetUrl,
    row.tags.join(" "),
    row.topic,
    row.intent,
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

export function applyKeywordFilters(rows: KeywordRow[], filters: KeywordFilters) {
  const contains = filters.contains.trim().toLowerCase();
  return rows.filter((row) => {
    const volume = row.volume / 1000;
    const rowSerp = new Set(row.serpFeatures.map((item) => item.toLowerCase()));
    return (
      (!filters.position.length ||
        filters.position.some((bucket) => inPositionBucket(row.position, bucket))) &&
      matchesChange(row, filters.change) &&
      volume >= filters.volMin &&
      (filters.volMax >= 50 || volume <= filters.volMax) &&
      (!contains || row.keyword.toLowerCase().includes(contains)) &&
      filters.tags.every((tag) => row.tags.includes(tag)) &&
      (!filters.topics.length || filters.topics.includes(row.topic ?? "")) &&
      (!filters.intents.length || filters.intents.includes(row.intent ?? "")) &&
      filters.serp.every((feature) =>
        (serpAliases[feature] ?? [feature]).some((alias) => rowSerp.has(alias)),
      ) &&
      (filters.lastCheck === "any" || row.lastCheckStatus === filters.lastCheck) &&
      (!filters.wrongUrl ||
        hasUrlMismatch({
          position: row.hasRankData ? row.position : null,
          rankingUrl: row.rankingUrl,
          targetUrl: row.targetUrl,
        })) &&
      (!filters.urlChanged || row.rankingPages > 1)
    );
  });
}

export function getFilterChips(filters: KeywordFilters): KeywordFilterChip[] {
  const chips: KeywordFilterChip[] = [];
  if (filters.position.length) {
    const labels = positionBuckets
      .filter((bucket) => filters.position.includes(bucket.id))
      .map((bucket) => bucket.label);
    chips.push({ key: "position", label: `Position: ${labels.join(", ")}` });
  }
  if (filters.change !== "any") {
    const label = changeOptions.find((item) => item.id === filters.change)?.label ?? filters.change;
    chips.push({ key: "change", label: `Change: ${label}` });
  }
  if (filters.volMin > 0 || filters.volMax < 50) {
    const maximumVolume = filters.volMax >= 50 ? "50k+" : `${filters.volMax}k`;
    chips.push({
      key: "volume",
      label: `Volume: ${filters.volMin}k - ${maximumVolume}`,
    });
  }
  if (filters.contains) {
    chips.push({ key: "contains", label: `Contains: "${filters.contains}"` });
  }
  for (const tag of filters.tags) {
    chips.push({ key: `tag:${tag}`, label: `Tag: ${tag}` });
  }
  for (const topic of filters.topics) {
    chips.push({ key: `topic:${topic}`, label: `Topic: ${topic}` });
  }
  for (const intent of filters.intents) {
    chips.push({ key: `intent:${intent}`, label: `Intent: ${intent}` });
  }
  for (const feature of filters.serp) {
    const label = serpFeatures.find((item) => item.id === feature)?.label ?? feature;
    chips.push({ key: `serp:${feature}`, label: `SERP: ${label}` });
  }
  if (filters.lastCheck !== "any") {
    const label =
      lastCheckOptions.find((item) => item.id === filters.lastCheck)?.label ?? filters.lastCheck;
    chips.push({ key: "lastCheck", label: `Last check: ${label}` });
  }
  if (filters.wrongUrl) {
    chips.push({ key: "wrongUrl", label: "Wrong URL ranking" });
  }
  if (filters.urlChanged) {
    chips.push({ key: "urlChanged", label: "Ranking URL changed" });
  }
  return chips;
}

export function removeFilterChip(filters: KeywordFilters, key: string): KeywordFilters {
  if (key.startsWith("tag:")) {
    return { ...filters, tags: filters.tags.filter((tag) => tag !== key.slice(4)) };
  }
  if (key.startsWith("topic:")) {
    return { ...filters, topics: filters.topics.filter((topic) => topic !== key.slice(6)) };
  }
  if (key.startsWith("intent:")) {
    return { ...filters, intents: filters.intents.filter((intent) => intent !== key.slice(7)) };
  }
  if (key.startsWith("serp:")) {
    return { ...filters, serp: filters.serp.filter((feature) => feature !== key.slice(5)) };
  }
  const reset = emptyKeywordFilters;
  if (key === "volume") {
    return { ...filters, volMax: reset.volMax, volMin: reset.volMin };
  }
  if (key === "position") {
    return { ...filters, position: reset.position };
  }
  if (key === "change") {
    return { ...filters, change: reset.change };
  }
  if (key === "contains") {
    return { ...filters, contains: reset.contains };
  }
  if (key === "lastCheck") {
    return { ...filters, lastCheck: reset.lastCheck };
  }
  if (key === "wrongUrl") {
    return { ...filters, wrongUrl: reset.wrongUrl };
  }
  if (key === "urlChanged") {
    return { ...filters, urlChanged: reset.urlChanged };
  }
  return filters;
}
