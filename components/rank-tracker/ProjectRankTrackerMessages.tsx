"use client";

import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import rankTrackerMessages from "@/messages/core/en/project-rank-tracker.json";
import rankTrackerKeywordDetailMessages from "@/messages/core/en/project-rank-tracker-keyword-detail.json";
import rankTrackerKeywordImportMessages from "@/messages/core/en/project-rank-tracker-keyword-import.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { ReactNode } from "react";

const messages = mergeMessageCatalogs(
  sharedMessages,
  rankTrackerMessages,
  rankTrackerKeywordImportMessages,
  rankTrackerKeywordDetailMessages,
);

/** Story and unit-test boundary for the exact shared and rank-tracker payload. */
export function ProjectRankTrackerMessages({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
      {children}
    </FeatureMessagesProvider>
  );
}
