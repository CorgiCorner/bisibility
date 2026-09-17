"use client";

import type { MigrationImportCountValue } from "@/lib/migration/import-counts";
import { useTranslations } from "next-intl";

export function useCloudImportCountLabels() {
  const t = useTranslations("cloudImport");

  function summary(item: MigrationImportCountValue) {
    switch (item.key) {
      case "alert_rules":
        return t("transfer.counts.alertRules", { count: item.value });
      case "alert_rules_skipped":
        return t("transfer.counts.alertRulesSkipped", { count: item.value });
      case "competitors":
        return t("transfer.counts.competitors", { count: item.value });
      case "competitors_skipped":
        return t("transfer.counts.competitorsSkipped", { count: item.value });
      case "history":
        return t("transfer.counts.history", { count: item.value });
      case "history_skipped":
        return t("transfer.counts.historySkipped", { count: item.value });
      case "history_unknown_depth":
        return t("transfer.counts.historyUnknownDepth", { count: item.value });
      case "keywords":
        return t("transfer.counts.keywords", { count: item.value });
      case "keywords_created":
        return t("transfer.counts.keywordsCreated", { count: item.value });
      case "keywords_skipped":
        return t("transfer.counts.keywordsSkipped", { count: item.value });
      case "notification_preferences":
        return t("transfer.counts.notificationPreferences", { count: item.value });
      case "notification_preferences_skipped":
        return t("transfer.counts.notificationPreferencesSkipped", { count: item.value });
      case "saved_views":
        return t("transfer.counts.savedViews", { count: item.value });
      case "saved_views_skipped":
        return t("transfer.counts.savedViewsSkipped", { count: item.value });
      default:
        return t("transfer.counts.unknown", { count: item.value, key: item.key });
    }
  }

  function tile(item: MigrationImportCountValue) {
    switch (item.key) {
      case "alert_rules":
        return t("transfer.tiles.alertRules", { count: item.value });
      case "alert_rules_skipped":
        return t("transfer.tiles.alertRulesSkipped", { count: item.value });
      case "competitors":
        return t("transfer.tiles.competitors", { count: item.value });
      case "competitors_skipped":
        return t("transfer.tiles.competitorsSkipped", { count: item.value });
      case "history":
        return t("transfer.tiles.history", { count: item.value });
      case "history_skipped":
        return t("transfer.tiles.historySkipped", { count: item.value });
      case "history_unknown_depth":
        return t("transfer.tiles.historyUnknownDepth", { count: item.value });
      case "keywords":
        return t("transfer.tiles.keywords", { count: item.value });
      case "keywords_created":
        return t("transfer.tiles.keywordsCreated", { count: item.value });
      case "keywords_skipped":
        return t("transfer.tiles.keywordsSkipped", { count: item.value });
      case "notification_preferences":
        return t("transfer.tiles.notificationPreferences", { count: item.value });
      case "notification_preferences_skipped":
        return t("transfer.tiles.notificationPreferencesSkipped", { count: item.value });
      case "saved_views":
        return t("transfer.tiles.savedViews", { count: item.value });
      case "saved_views_skipped":
        return t("transfer.tiles.savedViewsSkipped", { count: item.value });
      default:
        return t("transfer.tiles.unknown", { count: item.value, key: item.key });
    }
  }

  return { summary, tile };
}
