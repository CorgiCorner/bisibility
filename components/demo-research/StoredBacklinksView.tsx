"use client";

import { BacklinksResults } from "@/components/backlinks/BacklinksResults";
import type { BacklinksSnapshot } from "@/lib/backlinks/types";
import { StoredResearchEmpty } from "./StoredResearchEmpty";
import type { StoredResultFreshness } from "./StoredResultFreshness";

type StoredBacklinks = Omit<BacklinksSnapshot, "cachedUntil"> & StoredResultFreshness;

export function StoredBacklinksView({ result }: Readonly<{ result: StoredBacklinks | null }>) {
  if (!result) return <StoredResearchEmpty title="Backlinks" />;
  return (
    <BacklinksResults estimateCents={null} readOnly snapshot={result} storedFreshness={result} />
  );
}
