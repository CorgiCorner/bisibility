export type Metrics = {
  cpc: number | null;
  difficulty: number | null;
  serpFeatures: string[];
  volume: number | null;
};

export const metricPaths = {
  cpc: [["cpc"], ["keyword_info", "cpc"], ["keywordInfo", "cpc"], ["metrics", "cpc"]],
  difficulty: [
    ["difficulty"],
    ["keywordDifficulty"],
    ["keyword_difficulty"],
    ["keyword_info", "keyword_difficulty"],
    ["keywordInfo", "keywordDifficulty"],
    ["metrics", "difficulty"],
  ],
  volume: [
    ["volume"],
    ["searchVolume"],
    ["search_volume"],
    ["keyword_info", "search_volume"],
    ["keywordInfo", "searchVolume"],
    ["metrics", "volume"],
    ["metrics", "searchVolume"],
  ],
} as const;

export const featurePaths = [
  ["serpFeatures"],
  ["serp_features"],
  ["features"],
  ["metrics", "serpFeatures"],
] as const;
export const featurePresenceKeys = new Set([
  "ai_overview",
  "answer_box",
  "inline_images",
  "related_questions",
  "videos_results",
]);
const featureContainerKeys = new Set(["items", "organic_results", "result", "tasks"]);
const featureAliases: [RegExp, string][] = [
  [/featured|answer_box/, "featured"],
  [/people|related_question/, "paa"],
  [/sitelink/, "sitelinks"],
  [/image/, "image"],
  [/video/, "video"],
  [/\bai\b|ai_overview/, "ai"],
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function valueAt(value: unknown, path: readonly string[]) {
  return path.reduce<unknown>(
    (current, key) => (isRecord(current) ? current[key] : undefined),
    value,
  );
}

function numberValue(value: unknown) {
  const parsed = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

function firstNumber(raw: unknown, paths: readonly (readonly string[])[]) {
  for (const path of paths) {
    const value = numberValue(valueAt(raw, path));
    if (value !== null) return value;
  }
  return null;
}

function difficultyScore(value: number | null) {
  if (value === null) return null;
  const score = value > 0 && value <= 1 ? value * 100 : value;
  return Math.min(100, Math.max(0, Math.round(score)));
}

function normalizedFeature(value: unknown) {
  if (typeof value !== "string") return null;
  const key = value.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return featureAliases.find(([pattern]) => pattern.test(key))?.[1] ?? null;
}

function addFeature(value: unknown, features: Set<string>) {
  const feature = normalizedFeature(value);
  if (feature) features.add(feature);
}

function collectNestedFeatures(value: unknown, features: Set<string>, depth = 0) {
  if (depth > 8 || !value) return;
  if (Array.isArray(value)) {
    for (const item of value) collectNestedFeatures(item, features, depth + 1);
    return;
  }
  if (!isRecord(value)) return;
  addFeature(value.type, features);
  for (const [key, child] of Object.entries(value)) {
    if (featurePresenceKeys.has(key)) addFeature(key, features);
    if (featureContainerKeys.has(key)) collectNestedFeatures(child, features, depth + 1);
  }
}

function featuresFromRaw(raw: unknown) {
  const features = new Set<string>();
  for (const path of featurePaths) {
    const value = valueAt(raw, path);
    if (Array.isArray(value)) for (const item of value) addFeature(item, features);
  }
  collectNestedFeatures(raw, features);
  return [...features];
}

export function metricsFromChecks(checks: { raw: unknown }[]): Metrics {
  const features = new Set<string>();
  const metrics: Metrics = { cpc: null, difficulty: null, serpFeatures: [], volume: null };
  for (const check of checks) {
    metrics.cpc ??= firstNumber(check.raw, metricPaths.cpc);
    metrics.difficulty ??= difficultyScore(firstNumber(check.raw, metricPaths.difficulty));
    metrics.volume ??= firstNumber(check.raw, metricPaths.volume);
    for (const feature of featuresFromRaw(check.raw)) features.add(feature);
  }
  return { ...metrics, serpFeatures: [...features] };
}
