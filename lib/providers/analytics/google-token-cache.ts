import "server-only";

import { createHash } from "node:crypto";
import type { ProviderCredentials } from "@/lib/providers/types";

export type GoogleTokenGrant = {
  accessToken: string;
  expiresAt?: number;
  rotatedRefreshToken?: string | null;
};

type Entry = {
  owner: string;
  grant?: GoogleTokenGrant;
  pending?: Promise<GoogleTokenGrant>;
  invalidated?: boolean;
};

const MAX_ENTRIES = 100;
const REFRESH_TIMEOUT_MS = 30_000;
const entries = new Map<string, Entry>();

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

// A caller owns its wait; the refresh has its own deadline and can serve other callers.
export function waitForGoogleToken<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pending;
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    pending.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        if (signal.aborted) reject(signal.reason);
        else resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

function makeRoom(owner: string, key: string) {
  for (const [candidate, entry] of entries) {
    if (candidate === key) continue;
    if (entry.owner === owner) entry.invalidated = true;
    if (!entry.pending && (entry.invalidated || (entry.grant?.expiresAt ?? 0) <= Date.now())) {
      entries.delete(candidate);
    }
  }
  if (entries.size < MAX_ENTRIES) return;
  const oldest = [...entries].find(([, entry]) => !entry.pending);
  if (oldest) entries.delete(oldest[0]);
  else throw new Error("Access token refresh capacity is busy. Try again.");
}

export function cachedGoogleToken(
  input: {
    identity: NonNullable<ProviderCredentials["tokenCacheIdentity"]>;
    refreshToken: string;
    clientId: string;
    clientSecret: string;
  },
  exchange: (signal: AbortSignal) => Promise<GoogleTokenGrant>,
): Promise<GoogleTokenGrant> {
  const owner = digest(input.identity.connectionId);
  const key = digest([
    input.identity.connectionId,
    input.identity.credentialVersion,
    input.refreshToken,
    input.clientId,
    input.clientSecret,
  ]);
  const existing = entries.get(key);
  if (existing && !existing.invalidated) {
    if (existing.pending) return existing.pending;
    if (existing.grant && (existing.grant.expiresAt ?? 0) > Date.now()) {
      entries.delete(key);
      entries.set(key, existing);
      return Promise.resolve(existing.grant);
    }
    entries.delete(key);
  }
  // Keep invalidated exchanges tracked until they settle, including credential churn.
  if (existing?.pending) throw new Error("Access token credentials changed during refresh.");
  makeRoom(owner, key);
  const entry: Entry = { owner };
  const deadline = AbortSignal.timeout(REFRESH_TIMEOUT_MS);
  entry.pending = waitForGoogleToken(exchange(deadline), deadline).then(
    (grant) => {
      entry.pending = undefined;
      if (!entry.invalidated && (grant.expiresAt ?? 0) > Date.now()) entry.grant = grant;
      else entries.delete(key);
      return grant;
    },
    (error) => {
      entries.delete(key);
      throw error;
    },
  );
  entries.set(key, entry);
  return entry.pending;
}

// Match the rejected access token so an old request cannot evict a newer grant.
export function invalidateGoogleAccessToken(accessToken: string) {
  for (const [key, entry] of entries) {
    if (entry.grant?.accessToken === accessToken) entries.delete(key);
  }
}
