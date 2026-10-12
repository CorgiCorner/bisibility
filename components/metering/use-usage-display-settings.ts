"use client";

import { useSyncExternalStore } from "react";
import type { UsagePresentationOptions } from "./usage-number-format";

type DisplaySettings = Required<UsagePresentationOptions>;

const storageKey = "bisibility:usage-display:v1";
const changeEvent = "bisibility:usage-display-change";
const defaults: DisplaySettings = {
  moneyDisplay: "currency",
  moneyFractionDigits: 2,
  quantityFractionDigits: 2,
};
const defaultSnapshot = JSON.stringify(defaults);
let fallbackSnapshot = defaultSnapshot;
let unpersistedSnapshot: string | null = null;

function digits(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 20
    ? value
    : fallback;
}

function parseSettings(value: string | null): DisplaySettings {
  try {
    const parsed = JSON.parse(value ?? "null") as Partial<DisplaySettings> | null;
    return {
      moneyDisplay: parsed?.moneyDisplay === "raw-unit" ? "raw-unit" : "currency",
      moneyFractionDigits: digits(parsed?.moneyFractionDigits, 2),
      quantityFractionDigits: digits(parsed?.quantityFractionDigits, 2),
    };
  } catch {
    return defaults;
  }
}

function snapshot() {
  if (typeof window === "undefined") return defaultSnapshot;
  if (unpersistedSnapshot !== null) return unpersistedSnapshot;
  try {
    return JSON.stringify(parseSettings(window.localStorage.getItem(storageKey)));
  } catch {
    return fallbackSnapshot;
  }
}

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) {
      unpersistedSnapshot = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(changeEvent, listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(changeEvent, listener);
  };
}

function setOptions(update: UsagePresentationOptions) {
  const next = JSON.stringify(
    parseSettings(JSON.stringify({ ...JSON.parse(snapshot()), ...update })),
  );
  fallbackSnapshot = next;
  try {
    window.localStorage.setItem(storageKey, next);
    unpersistedSnapshot = null;
  } catch {
    // Display preferences still work when browser storage is unavailable.
    unpersistedSnapshot = next;
  }
  window.dispatchEvent(new Event(changeEvent));
}

/** Keep presentation preferences in sync across usage surfaces and browser tabs. */
export function useUsageDisplaySettings() {
  const value = useSyncExternalStore(subscribe, snapshot, () => defaultSnapshot);
  return { options: parseSettings(value), setOptions };
}
