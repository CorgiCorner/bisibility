"use client";

import type { KeywordRankedImportMessages } from "@/components/onboarding/steps/KeywordRankedImport";
import type { KeywordTopQueryImportMessages } from "@/components/onboarding/steps/KeywordTopQueryImport";
import { useTranslations } from "next-intl";

export function useProjectKeywordImportMessages(): {
  ranked: KeywordRankedImportMessages;
  topQueries: KeywordTopQueryImportMessages;
} {
  const t = useTranslations("projectRankTracker.keywordImport");

  return {
    ranked: {
      added: (values) => t("ranked.added", values),
      budgetExhausted: t("ranked.budgetExhausted"),
      choose: t("ranked.choose"),
      connection: t("ranked.connection"),
      connectionLabel: t("ranked.connectionLabel"),
      description: t("ranked.description"),
      drawer: {
        aboutPage: (values) => t("rankedDrawer.aboutPage", values),
        add: (values) => t("rankedDrawer.add", values),
        cancel: t("rankedDrawer.cancel"),
        clear: t("rankedDrawer.clear"),
        drawerDescription: t("rankedDrawer.drawerDescription"),
        drawerTitle: t("rankedDrawer.drawerTitle"),
        estimatedTraffic: t("rankedDrawer.estimatedTraffic"),
        inDraft: t("rankedDrawer.inDraft"),
        keyword: t("rankedDrawer.keyword"),
        load: t("rankedDrawer.load"),
        position: t("rankedDrawer.position"),
        remaining: (values) => t("rankedDrawer.remaining", values),
        select: (values) => t("rankedDrawer.select", values),
        selectAll: t("rankedDrawer.selectAll"),
        selectKeyword: t("rankedDrawer.selectKeyword"),
        spent: (values) => t("rankedDrawer.spent", values),
        table: t("rankedDrawer.table"),
        top: t("rankedDrawer.top"),
        tracked: t("rankedDrawer.tracked"),
        use: (values) => t("rankedDrawer.use", values),
        variants: (values) => t("rankedDrawer.variants", values),
        volume: t("rankedDrawer.volume"),
      },
      import: t("ranked.import"),
      importFor: (values) => t("ranked.importFor", values),
      lookupFailed: t("ranked.lookupFailed"),
      needsReauth: t("ranked.needsReauth"),
      noDomain: t("ranked.noDomain"),
      noSource: t("ranked.noSource"),
      rateLimited: t("ranked.rateLimited"),
      raiseBudget: t("ranked.raiseBudget"),
      reconnect: t("ranked.reconnect"),
      unsupportedLocation: t("ranked.unsupportedLocation"),
    },
    topQueries: {
      added: (values) => t("topQueries.added", values),
      choose: t("topQueries.choose"),
      drawer: {
        add: (values) => t("suggestionDrawer.add", values),
        cancel: t("suggestionDrawer.cancel"),
        clear: t("suggestionDrawer.clear"),
        clicks: t("suggestionDrawer.clicks"),
        description: t("suggestionDrawer.description"),
        filterAria: t("suggestionDrawer.filterAria"),
        filterPlaceholder: t("suggestionDrawer.filterPlaceholder"),
        hidden: (values) => t("suggestionDrawer.hidden", values),
        hide: t("suggestionDrawer.hide"),
        impressions: t("suggestionDrawer.impressions"),
        inDraft: t("suggestionDrawer.inDraft"),
        metric: (values) => t("suggestionDrawer.metric", values),
        metricUnavailable: t("suggestionDrawer.metricUnavailable"),
        monthlyChecks: (values) => t("suggestionDrawer.monthlyChecks", values),
        monthlyChecksCostBelowCent: (values) =>
          t("suggestionDrawer.monthlyChecksCostBelowCent", values),
        monthlyChecksCost: (values) => t("suggestionDrawer.monthlyChecksCost", values),
        query: t("suggestionDrawer.query"),
        selected: (values) => t("suggestionDrawer.selected", values),
        selectionCount: (values) => t("suggestionDrawer.selectionCount", values),
        selectAll: t("suggestionDrawer.selectAll"),
        show: t("suggestionDrawer.show"),
        title: t("suggestionDrawer.title"),
        top: (values) => t("suggestionDrawer.top", values),
        tracked: t("suggestionDrawer.tracked"),
        use: (values) => t("suggestionDrawer.use", values),
      },
      empty: t("topQueries.empty"),
      expiredAuthorization: t("topQueries.expiredAuthorization"),
      importing: t("topQueries.importing"),
      import: t("topQueries.import"),
      loadError: t("topQueries.loadError"),
      noSource: t("topQueries.noSource"),
      rateLimited: t("topQueries.rateLimited"),
      reconnect: t("topQueries.reconnect"),
    },
  };
}
