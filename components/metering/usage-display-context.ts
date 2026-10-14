"use client";
import {
  defaultUsageDisplayOptions,
  type ProjectUsageDisplaySettings,
  type UsageDisplaySaveResult,
} from "@/lib/project-usage-display/schema";
import { createContext } from "react";
import type { UsagePresentationOptions } from "./usage-number-format";

export type DisplayContext = {
  options: ProjectUsageDisplaySettings["options"];
  canEdit: boolean;
  pending: boolean;
  error: Exclude<UsageDisplaySaveResult["kind"], "saved"> | null;
  setOptions(update: UsagePresentationOptions): void;
};
export const UsageDisplaySettingsContext = createContext<DisplayContext>({
  options: defaultUsageDisplayOptions,
  canEdit: false,
  pending: false,
  error: null,
  setOptions: () => undefined,
});
