import { createHash } from "node:crypto";
import { type SerpDepth, serpDepthValues } from "@/lib/serp/constants";
import type { SerpRankLocation } from "@/lib/serp/location";
import { z } from "zod";
import type { ComparisonQuote } from "./types";
export const requestUuid = z.uuid();
export const comparisonDepth = 20 as const;
export const comparisonPreviewTtlMs = 5 * 60_000;
type FrozenComparisonFields = {
  depth?: SerpDepth;
  trackedTarget?: {
    id: string;
    publicId: string;
    targetUrl: string | null;
    targetEpoch: string;
    policyEpoch: string;
  };
  text: string;
  device: "desktop" | "mobile";
  domain: string;
  locationKey?: string;
  locationKind?: "country" | "region" | "city";
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
export type FrozenComparison = FrozenComparisonFields &
  ({ version: 1; keywordId: string } | { version: 2; keywordId: null });
export function comparisonHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function comparisonKeyword(source: FrozenComparison) {
  return {
    id: source.keywordId ?? "",
    text: source.text,
    device: source.device,
    locationLabel: source.locationLabel,
  };
}
export function parseComparisonSnapshot(value: unknown): FrozenComparison {
  // Snapshots are server-authored only; fail closed for unknown formats.
  const snapshot = value as FrozenComparison;
  const providers = snapshot?.connections?.map((side) => side.provider);
  const validProviders =
    Array.isArray(providers) &&
    providers.length >= 1 &&
    providers.length <= 2 &&
    new Set(providers).size === providers.length &&
    providers.every((provider) => provider === "dataforseo" || provider === "serpapi");
  if (!validProviders || (snapshot.version !== 1 && snapshot.version !== 2))
    throw new Error("Comparison snapshot is unavailable.");
  if (
    snapshot.version === 1 &&
    (snapshot.connections.length !== 2 ||
      snapshot.connections[0].provider !== "dataforseo" ||
      snapshot.connections[1].provider !== "serpapi")
  )
    throw new Error("Comparison snapshot is unavailable.");
  if (
    snapshot.version === 2 &&
    (snapshot.keywordId !== null ||
      typeof snapshot.text !== "string" ||
      !snapshot.text.trim() ||
      snapshot.text.length > 500 ||
      !["desktop", "mobile"].includes(snapshot.device) ||
      !snapshot.locationId ||
      !snapshot.domain)
  )
    throw new Error("Playground snapshot is unavailable.");
  if (snapshot.depth !== undefined && !serpDepthValues.includes(snapshot.depth))
    throw new Error("Invalid comparison depth.");
  return snapshot;
}
