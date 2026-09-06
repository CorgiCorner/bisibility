"use client";

import { useCallback, useSyncExternalStore } from "react";

export const NOTICE_DISMISSAL_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export type RankRunNoticeIdentity =
  | { kind: "checks-running" | "check-failures" | "market-slice"; runId: string }
  | { kind: "budget-forecast" | "budget-exhausted"; capPeriod: string };

type DismissalRecord = { expiresAt: number };

const STORAGE_PREFIX = "bisibility:rank-run-notice-dismissal:v1";
const listeners = new Set<() => void>();

function storage() {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function dismissalSubject(identity: RankRunNoticeIdentity) {
  return "runId" in identity ? identity.runId : identity.capPeriod;
}

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readDismissal(identity: RankRunNoticeIdentity, now: number): DismissalRecord | null {
  const browserStorage = storage();
  if (!browserStorage) return null;
  const key = rankRunNoticeDismissalStorageKey(identity);
  const raw = browserStorage.getItem(key);
  if (!raw) return null;
  try {
    const record = JSON.parse(raw) as DismissalRecord;
    if (!Number.isFinite(record.expiresAt) || record.expiresAt <= now) {
      browserStorage.removeItem(key);
      return null;
    }
    return record;
  } catch {
    browserStorage.removeItem(key);
    return null;
  }
}

export function rankRunNoticeDismissalStorageKey(identity: RankRunNoticeIdentity) {
  return `${STORAGE_PREFIX}:${identity.kind}:${dismissalSubject(identity)}`;
}

export function dismissRankRunNotice(identity: RankRunNoticeIdentity, now = Date.now()) {
  try {
    storage()?.setItem(
      rankRunNoticeDismissalStorageKey(identity),
      JSON.stringify({ expiresAt: now + NOTICE_DISMISSAL_TTL_MS } satisfies DismissalRecord),
    );
  } catch {
    return;
  }
  notify();
}

export function isRankRunNoticeDismissed(identity: RankRunNoticeIdentity, now = Date.now()) {
  return readDismissal(identity, now) !== null;
}

function dismissedSnapshot(notices: readonly RankRunNoticeIdentity[]) {
  return notices
    .filter((notice) => isRankRunNoticeDismissed(notice))
    .map(rankRunNoticeDismissalStorageKey)
    .join("\n");
}

export function useRankRunNoticeDismissalSnapshot(notices: readonly RankRunNoticeIdentity[]) {
  const getSnapshot = useCallback(() => dismissedSnapshot(notices), [notices]);
  return useSyncExternalStore(subscribe, getSnapshot, () => "");
}

export function isInRankRunNoticeDismissalSnapshot(
  snapshot: string,
  identity: RankRunNoticeIdentity,
) {
  return snapshot.split("\n").includes(rankRunNoticeDismissalStorageKey(identity));
}
