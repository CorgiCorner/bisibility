import type { TrackingSampleRow } from "./workspace";

export function trackingCitationGroups(samples: readonly TrackingSampleRow[]) {
  const domains = new Map<string, Map<string, { url: string; samples: TrackingSampleRow[] }>>();
  for (const sample of samples) {
    const seen = new Set<string>();
    for (const citation of sample.citations) {
      let url: URL;
      try {
        url = new URL(citation.url);
      } catch {
        continue;
      }
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) continue;
      url.hash = "";
      const key = url.href;
      if (seen.has(key)) continue;
      seen.add(key);
      const domain = url.hostname.toLowerCase();
      const urls = domains.get(domain) ?? new Map();
      const entry = urls.get(key) ?? { url: key, samples: [] };
      entry.samples.push(sample);
      urls.set(key, entry);
      domains.set(domain, urls);
    }
  }
  return [...domains]
    .map(([domain, urls]) => ({
      domain,
      sampleCount: new Set(
        [...urls.values()].flatMap((entry) => entry.samples.map((sample) => sample.id)),
      ).size,
      urls: [...urls.values()].sort(
        (a, b) => b.samples.length - a.samples.length || a.url.localeCompare(b.url),
      ),
    }))
    .sort((a, b) => b.sampleCount - a.sampleCount || a.domain.localeCompare(b.domain));
}
