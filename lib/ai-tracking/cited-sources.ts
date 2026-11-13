import { citationHost, hostOnSite } from "@/lib/ai-tracking/overview-model";

export type CitedSourceBar = {
  host: string;
  links: number;
  own: boolean;
};

/** Citation hosts for one answer, widest bar first. The project domain is marked as own. */
export function citedSourceSummary(
  citations: readonly { url: string }[],
  domain: string | null,
): CitedSourceBar[] {
  const counts = new Map<string, number>();
  for (const citation of citations) {
    const host = citationHost(citation.url);
    if (!host) continue;
    counts.set(host, (counts.get(host) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([host, links]) => ({ host, links, own: hostOnSite(host, domain) }))
    .sort((left, right) => right.links - left.links || left.host.localeCompare(right.host));
}
