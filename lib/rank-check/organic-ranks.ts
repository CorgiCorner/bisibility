import { normalizeDomain } from "@/lib/domains/normalize";
import type { SerpOrganicResult } from "@/lib/providers/types";

export type OrganicDomainRank = {
  domain: string;
  position: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function numericPosition(value: unknown) {
  const parsed = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof parsed === "number" && Number.isInteger(parsed) && parsed > 0 && parsed <= 100
    ? parsed
    : null;
}

function compactRanks(items: Iterable<OrganicDomainRank>) {
  const positions = new Map<string, number>();
  for (const item of items) {
    const current = positions.get(item.domain);
    if (!current || item.position < current) positions.set(item.domain, item.position);
  }
  return [...positions]
    .map(([domain, position]) => ({ domain, position }))
    .sort((a, b) => a.position - b.position || a.domain.localeCompare(b.domain));
}

function legacyItem(value: unknown) {
  if (!isRecord(value) || (typeof value.type === "string" && value.type !== "organic")) {
    return null;
  }
  const domain = ["domain", "url", "link", "displayed_link", "source"]
    .map((key) => (typeof value[key] === "string" ? normalizeDomain(value[key]) : null))
    .find((candidate) => candidate !== null);
  const position = ["rank", "position", "rank_group", "rank_absolute"]
    .map((key) => numericPosition(value[key]))
    .find((rank) => rank !== null);
  return domain && position ? { domain, position } : null;
}

export function organicDomainRanksFromResults(results: readonly SerpOrganicResult[]) {
  return compactRanks(
    results.flatMap((item) => {
      const domain = normalizeDomain(item.domain ?? item.url);
      const position = numericPosition(item.rank);
      return domain && position ? [{ domain, position }] : [];
    }),
  );
}

/** Returns null only when the payload has no recognized organic result container. */
export function organicDomainRanksFromRaw(raw: unknown): OrganicDomainRank[] | null {
  if (!isRecord(raw)) return null;
  const items: unknown[] = [];
  let recognized = false;
  for (const key of ["organic_results", "organicResults"]) {
    if (Array.isArray(raw[key])) {
      recognized = true;
      items.push(...raw[key]);
    }
  }
  if (Array.isArray(raw.tasks)) {
    recognized = true;
    for (const task of raw.tasks) {
      if (!isRecord(task) || !Array.isArray(task.result)) continue;
      for (const result of task.result) {
        if (isRecord(result) && Array.isArray(result.items)) items.push(...result.items);
      }
    }
  }
  if (!recognized) return null;
  return compactRanks(items.flatMap((item) => legacyItem(item) ?? []));
}

export function storedOrganicDomainRanks(value: unknown): OrganicDomainRank[] | null {
  if (!Array.isArray(value)) return null;
  return compactRanks(
    value.flatMap((item) => {
      if (!isRecord(item) || typeof item.domain !== "string") return [];
      const domain = normalizeDomain(item.domain);
      const position = numericPosition(item.position);
      return domain && position ? [{ domain, position }] : [];
    }),
  );
}
