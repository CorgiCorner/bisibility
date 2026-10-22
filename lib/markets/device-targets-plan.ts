import { createHash } from "node:crypto";
import { normalizeResearchKeyword } from "@/lib/keyword-research/request-key";
import { KEYWORD_IMPORT_MAX } from "@/lib/schemas/keyword";
import type { MarketDeviceCandidate, MarketDeviceSelection } from "./device-targets-input";
export const MARKET_DEVICE_SOURCE_MAX = KEYWORD_IMPORT_MAX * 4;
export type DeviceSourceKeyword = {
  publicId: string;
  text: string;
  device: string;
  archivedAt: Date | null;
  targetUrl: string | null;
  topic: string | null;
  intent: string | null;
  tags: { tag: { name: string } }[];
};
type CandidateKeyword = Pick<DeviceSourceKeyword, "publicId" | "text" | "device" | "archivedAt">;
function canonicalSources<T extends CandidateKeyword>(keywords: readonly T[]) {
  const terms = new Map<string, T>();
  for (const keyword of [...keywords].sort((a, b) =>
    a.publicId < b.publicId ? -1 : a.publicId > b.publicId ? 1 : 0,
  ))
    if (!keyword.archivedAt && !terms.has(normalizeResearchKeyword(keyword.text)))
      terms.set(normalizeResearchKeyword(keyword.text), keyword);
  return terms;
}
/** Read-only choices share the plan's canonical active source. Archived variants stay occupied. */
export function marketDeviceCandidates(
  keywords: readonly CandidateKeyword[],
): MarketDeviceCandidate[] {
  const devicesByTerm = new Map<string, Set<"desktop" | "mobile">>();
  for (const row of keywords) {
    if (row.device !== "desktop" && row.device !== "mobile") continue;
    const normalized = normalizeResearchKeyword(row.text);
    const devices = devicesByTerm.get(normalized) ?? new Set<"desktop" | "mobile">();
    devices.add(row.device);
    devicesByTerm.set(normalized, devices);
  }
  return [...canonicalSources(keywords)].map(([normalized, source]) => ({
    id: source.publicId,
    keyword: source.text,
    existingDevices: (["desktop", "mobile"] as const).filter((device) =>
      devicesByTerm.get(normalized)?.has(device),
    ),
  }));
}
/** Archived variants are deliberately excluded from both source terms and new rows. */
export function marketDevicePlan(
  keywords: readonly DeviceSourceKeyword[],
  selection: MarketDeviceSelection,
  schedule: unknown,
) {
  if (keywords.length > MARKET_DEVICE_SOURCE_MAX)
    return { outcome: "unavailable" as const, reason: "selection_too_large" as const };
  const sources = canonicalSources(keywords);
  const selected = selection.keywordIds === undefined ? null : new Set(selection.keywordIds);
  const candidateIds = new Set([...sources.values()].map((source) => source.publicId));
  if (selected && [...selected].some((id) => !candidateIds.has(id)))
    return { outcome: "unavailable" as const, reason: "selection_changed" as const };
  const terms = new Map(
    [...sources].filter(([, source]) => !selected || selected.has(source.publicId)),
  );
  let existingCount = 0;
  let archivedCount = 0;
  let ambiguous = false;
  const settings = (row: DeviceSourceKeyword) =>
    JSON.stringify([
      row.targetUrl,
      row.topic,
      row.intent,
      row.tags.map(({ tag }) => tag.name).sort(),
    ]);
  const missing = [...terms.entries()].flatMap(([normalized, source]) => {
    const existing = keywords.filter(
      (row) => row.device === selection.device && normalizeResearchKeyword(row.text) === normalized,
    );
    if (existing.some((row) => !row.archivedAt)) {
      existingCount++;
      return [];
    }
    if (existing.length) {
      archivedCount++;
      return [];
    }
    const variants = keywords.filter(
      (row) => !row.archivedAt && normalizeResearchKeyword(row.text) === normalized,
    );
    if (variants.some((row) => settings(row) !== settings(source))) ambiguous = true;
    return [source];
  });
  if (ambiguous) return { outcome: "unavailable" as const, reason: "ambiguous_keywords" as const };
  if (missing.length > KEYWORD_IMPORT_MAX)
    return { outcome: "unavailable" as const, reason: "selection_too_large" as const };
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([selection, schedule, keywords]))
    .digest("hex");
  return {
    outcome: "ready" as const,
    missing,
    fingerprint,
    keywordCount: terms.size,
    newCheckCount: missing.length,
    existingCount,
    archivedCount,
  };
}
