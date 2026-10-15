import { createHash } from "node:crypto";
import type { SerpRankLocation } from "@/lib/serp/location";
import { z } from "zod";
import type { ComparisonQuote } from "./types";
export const requestUuid = z.uuid();
export const comparisonDepth = 20 as const;
export const comparisonPreviewTtlMs = 5 * 60_000;
export type FrozenComparison = {
  version: 1;
  keywordId: string;
  text: string;
  device: "desktop" | "mobile";
  domain: string;
  locationId: string;
  locationLabel: string;
  location: SerpRankLocation;
  connections: {
    provider: "dataforseo" | "serpapi";
    id: string;
    revision: string;
    credentialVersion: string | null;
    fundingSource: "own" | "hosted";
    providerEstimateCents: number;
    customerEstimateCents: number;
    quote: ComparisonQuote;
  }[];
};
export function comparisonHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function comparisonKeyword(source: FrozenComparison) {
  return {
    id: source.keywordId,
    text: source.text,
    device: source.device,
    locationLabel: source.locationLabel,
  };
}
export function parseComparisonSnapshot(value: unknown): FrozenComparison {
  // Snapshots are server-authored only; fail closed for unknown formats.
  const snapshot = value as FrozenComparison;
  if (
    snapshot?.version !== 1 ||
    !Array.isArray(snapshot.connections) ||
    snapshot.connections.length !== 2 ||
    snapshot.connections[0].provider !== "dataforseo" ||
    snapshot.connections[1].provider !== "serpapi"
  )
    throw new Error("Comparison snapshot is unavailable.");
  return snapshot;
}
