"use client";
import { useContext } from "react";
import { UsageDisplaySettingsContext } from "./usage-display-context";

export function useUsageDisplaySettings() {
  return useContext(UsageDisplaySettingsContext);
}
