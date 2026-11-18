import { routingCredentials } from "./attempt-provenance.test-support";
import { extendedResult } from "./store-result.test-support";

export function largeResult() {
  const value = extendedResult();
  value.answer = "a".repeat(24 * 1024);
  value.usage = { ...value.usage, completeness: "complete", inputTokens: 8, outputTokens: 3 };
  const money = value.costEvidence?.providerReported?.money;
  if (!money) throw new Error("Missing measured fixture cost");
  value.providerCost = { ...money };
  value.rawEvidenceId = "evidence:example";
  value.consultedSources = {
    sources: Array.from({ length: 100 }, (_, i) => ({
      sourceId: `consulted-${i}`.padEnd(256, "x"),
      url: `https://example.org/${i}/`.padEnd(2048, "a"),
      title: "a".repeat(512),
    })),
    total: 100,
    omitted: 0,
    truncated: false,
  };
  return value;
}

export function oversizedCitations() {
  const value = largeResult();
  value.citations =
    value.consultedSources?.sources.map((source, i) => ({
      ...source,
      occurrenceId: `occurrence-${i}`,
      start: null,
      end: null,
    })) ?? [];
  value.citationTotals = { total: 100, omitted: 0 };
  return value;
}

export function generatedResult(seed: number) {
  const value = largeResult();
  if (seed % 3 === 0) {
    value.routingAttemptCredentials = {
      ...routingCredentials(),
      attempts: Array(100).fill(routingCredentials().attempts[0]),
    };
    if (value.costEvidence) value.costEvidence.upstreamInferenceDiscardReason = "inconsistent";
  }
  const sources = value.consultedSources;
  if (!sources) throw new Error("Missing generated sources");
  const text = ["a", "é", "😀", '"\\\n\t'][seed % 4];
  value.answer = text.repeat(Math.floor((((seed % 8) + 1) * 300) / text.length));
  value.column.settings.temperature = [0, Number.MIN_VALUE, 1e-7, 1.23456789012345][seed % 4];
  sources.sources = sources.sources.slice(0, seed % 2 ? 100 : seed);
  for (const source of sources.sources) source.title = text.repeat(Math.floor(512 / text.length));
  sources.total = sources.sources.length;
  return value;
}
