"use client";

import { useSyncExternalStore } from "react";

const KEY = "bisibility.public-report.entered";
let clientMotion: boolean | null = null;

function subscribe() {
  return () => {};
}

function clientSnapshot() {
  if (clientMotion !== null) return clientMotion;
  const reduce =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let seen = true;
  try {
    seen = window.sessionStorage.getItem(KEY) === "1";
  } catch {
    seen = true;
  }
  clientMotion = !reduce && !seen;
  if (clientMotion) {
    try {
      window.sessionStorage.setItem(KEY, "1");
    } catch {
      clientMotion = false;
    }
  }
  return clientMotion;
}

function serverSnapshot() {
  return false;
}

export function usePublicReportMotion() {
  return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}
