import { sha256Bytes } from "./sha256";

export const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1_000;
export const WEEKLY_INTERVAL_MS = 7 * DAILY_INTERVAL_MS;

export function stableIntervalPhaseMs(keywordId: string, intervalMs: number) {
  const intervalSeconds = Math.floor(intervalMs / 1_000);
  const digest = sha256Bytes(keywordId);
  let hash = 0n;
  for (const byte of digest.subarray(0, 8)) {
    hash = (hash << 8n) | BigInt(byte);
  }
  return Number(hash % BigInt(intervalSeconds)) * 1_000;
}

export function nextStableIntervalTime(from: Date, keywordId: string, intervalMs: number) {
  const phase = stableIntervalPhaseMs(keywordId, intervalMs);
  const remainder = (((from.getTime() - phase) % intervalMs) + intervalMs) % intervalMs;
  const wait = remainder === 0 ? intervalMs : intervalMs - remainder;
  return new Date(from.getTime() + wait);
}
