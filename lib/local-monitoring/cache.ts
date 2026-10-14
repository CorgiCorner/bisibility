import { contentKey, isoTime, requireToken } from "./key";
import { executionTargetKey } from "./target-key";
import type { ExecutionTargetV1 } from "./types";

export type LocalCacheProvenance = Readonly<{
  connectionId: string;
  provider: string;
  adapterVersion: string;
  normalizationVersion: string;
}>;
export type LocalCachedEvidence = Readonly<{
  key: string;
  evidenceId: string;
  originalObservedAt: string | null;
  storedAt: string;
  expiresAt: string;
}>;
export interface LocalEvidenceCachePort {
  read(key: string): Promise<LocalCachedEvidence | null>;
}

export function localCacheKey(target: ExecutionTargetV1, provenance: LocalCacheProvenance) {
  Object.values(provenance).forEach((value) => {
    requireToken(value, "cache provenance");
  });
  return contentKey("local-evidence-cache-v1", [
    executionTargetKey(target),
    provenance.connectionId,
    provenance.provider,
    provenance.adapterVersion,
    provenance.normalizationVersion,
  ]);
}

/** A cache miss has no transport side effect and cannot refresh the historical observation time. */
export async function readLocalEvidenceCache(input: {
  target: ExecutionTargetV1;
  provenance: LocalCacheProvenance;
  now: Date;
  cache: LocalEvidenceCachePort;
}) {
  const time = input.now.getTime();
  if (!Number.isFinite(time)) throw new Error("Invalid cache read time");
  const key = localCacheKey(input.target, input.provenance);
  const retained = await input.cache.read(key);
  if (!retained) return null;
  if (retained.key !== key) throw new Error("Cache scope mismatch");
  requireToken(retained.evidenceId, "cache observation");
  const stored = isoTime(retained.storedAt);
  const expires = isoTime(retained.expiresAt);
  if (stored > time || expires <= stored) throw new Error("Invalid cache retention metadata");
  if (retained.originalObservedAt !== null && isoTime(retained.originalObservedAt) > stored)
    throw new Error("Cache observation is newer than storage");
  return expires > time ? Object.freeze(structuredClone(retained)) : null;
}
