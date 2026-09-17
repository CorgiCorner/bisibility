import type { useTranslations } from "next-intl";
import type { KeywordRankedImportMessages } from "./KeywordRankedImport";
import type { KeywordTopQueryImportMessages } from "./KeywordTopQueryImport";

type OnboardingKeywordsTranslator = ReturnType<typeof useTranslations<"onboarding.keywords">>;

export function topQueryImportMessages(
  t: OnboardingKeywordsTranslator,
): KeywordTopQueryImportMessages {
  return {
    added: (values) => t("import.added", values),
    choose: t("import.choose"),
    drawer: {
      add: (values) => t("import.drawer.add", values),
      cancel: t("import.drawer.cancel"),
      clear: t("import.drawer.clear"),
      clicks: t("import.drawer.clicks"),
      description: t("import.drawer.description"),
      filterAria: t("import.drawer.filterAria"),
      filterPlaceholder: t("import.drawer.filterPlaceholder"),
      hidden: (values) => t("import.drawer.hidden", values),
      hide: t("import.drawer.hide"),
      impressions: t("import.drawer.impressions"),
      inDraft: t("import.drawer.inDraft"),
      metric: (values) => t("import.drawer.metric", values),
      metricUnavailable: t("import.drawer.metricUnavailable"),
      monthlyChecks: (values) => t("import.drawer.monthlyChecks", values),
      monthlyChecksCostBelowCent: (values) => t("import.drawer.monthlyChecksCostBelowCent", values),
      monthlyChecksCost: (values) => t("import.drawer.monthlyChecksCost", values),
      query: t("import.drawer.query"),
      selected: (values) => t("import.drawer.selected", values),
      selectionCount: (values) => t("import.drawer.selectionCount", values),
      selectAll: t("import.drawer.selectAll"),
      show: t("import.drawer.show"),
      title: t("import.drawer.title"),
      top: (values) => t("import.drawer.top", values),
      tracked: t("import.drawer.tracked"),
      use: (values) => t("import.drawer.use", values),
    },
    empty: t("import.empty"),
    expiredAuthorization: t("import.expiredAuthorization"),
    importing: t("import.importing"),
    import: t("import.import"),
    loadError: t("import.loadError"),
    noSource: t("import.noSource"),
    rateLimited: t("import.rateLimited"),
    reconnect: t("import.reconnect"),
  };
}

export function rankedImportMessages(t: OnboardingKeywordsTranslator): KeywordRankedImportMessages {
  return {
    added: (values) => t("ranked.added", values),
    budgetExhausted: t("ranked.budgetExhausted"),
    choose: t("ranked.choose"),
    connection: t("ranked.connection"),
    connectionLabel: t("ranked.connectionLabel"),
    description: t("ranked.description"),
    drawer: {
      aboutPage: (values) => t("ranked.aboutPage", values),
      add: (values) => t("ranked.add", values),
      cancel: t("ranked.cancel"),
      clear: t("ranked.clear"),
      drawerDescription: t("ranked.drawerDescription"),
      drawerTitle: t("ranked.drawerTitle"),
      estimatedTraffic: t("ranked.estimatedTraffic"),
      inDraft: t("ranked.inDraft"),
      keyword: t("ranked.keyword"),
      load: t("ranked.load"),
      position: t("ranked.position"),
      remaining: (values) => t("ranked.remaining", values),
      select: (values) => t("ranked.select", values),
      selectAll: t("ranked.selectAll"),
      selectKeyword: t("ranked.selectKeyword"),
      spent: (values) => t("ranked.spent", values),
      table: t("ranked.table"),
      top: t("ranked.top"),
      tracked: t("ranked.tracked"),
      use: (values) => t("ranked.use", values),
      variants: (values) => t("ranked.variants", values),
      volume: t("ranked.volume"),
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
  };
}
