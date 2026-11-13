import type { useTranslations } from "next-intl";
import type { CommandPaletteCopy } from "./command-palette-groups";

type PaletteTranslations = ReturnType<typeof useTranslations<"shell.commandPalette">>;
type NavigationTranslations = ReturnType<typeof useTranslations<"shell.navigation">>;

/** Turns scoped catalog entries into the generated palette's stable display contract. */
export function commandPaletteCopy(
  t: PaletteTranslations,
  navigation: NavigationTranslations,
): CommandPaletteCopy {
  return {
    actionItems: {
      addKeyword: t("actionItems.addKeyword"),
      exportKeywords: t("actionItems.exportKeywords"),
      importCsv: t("actionItems.importCsv"),
      signOut: t("actionItems.signOut"),
      toggleTheme: t("actionItems.toggleTheme"),
    },
    groups: {
      actions: t("actions"),
      keywords: t("groups.keywords"),
      markets: t("groups.markets"),
      navigate: t("groups.navigate"),
    },
    hints: {
      account: t("hints.account"),
      downloadFile: t("hints.downloadFile"),
      goTo: t("hints.goTo"),
      keyword: t("hints.keyword"),
      market: t("hints.market"),
      newKeyword: t("hints.newKeyword"),
      theme: t("hints.theme"),
      uploadFile: t("hints.uploadFile"),
    },
    marketNavigation: (section, market) => t("marketNavigation", { market, section }),
    navigation: {
      "AI Visibility": navigation("items.aiVisibilityModule"),
      "Prompt Research": navigation("items.promptResearch"),
      "Prompt Tracker": navigation("items.aiTracking"),
      "Model Playground": navigation("items.promptExplorer"),
      "Site Audit": navigation("items.siteAudit"),
      "Project Context": navigation("items.projectContext"),
      Reports: navigation("items.agentReports"),
      Annotations: navigation("items.annotations"),
      Alerts: navigation("items.alerts"),
      Backlinks: navigation("items.backlinks"),
      Competitors: navigation("items.competitors"),
      Dashboard: navigation("items.dashboard"),
      "Docs and self-hosting": t("navigation.docs"),
      "Domain Overview": navigation("items.domainOverview"),
      Install: navigation("items.install"),
      Providers: navigation("items.integrations"),
      "Keyword Research": navigation("items.keywordResearch"),
      "SERP Playground": navigation("items.serpPlayground"),
      Markets: navigation("items.markets"),
      "Rank Tracker": navigation("items.rankTracker"),
      Runs: navigation("items.runs"),
      Schedules: navigation("items.schedules"),
      Usage: navigation("items.usage"),
      "Search Console": navigation("items.searchConsole"),
      Pages: navigation("items.pages"),
      Settings: navigation("items.settings"),
    },
    navigationKeywords: {
      "Model Playground": [
        navigation("keywords.modelPlayground.promptPlayground"),
        navigation("keywords.modelPlayground.compareModels"),
        navigation("keywords.modelPlayground.llm"),
      ],
      Reports: [navigation("keywords.agentReports.legacy")],
      "AI Visibility": [
        navigation("keywords.aiVisibilityModule.geo"),
        navigation("keywords.aiVisibilityModule.aeo"),
        navigation("keywords.aiVisibilityModule.llm"),
        navigation("keywords.aiVisibilityModule.llmo"),
        navigation("keywords.aiVisibilityModule.chatgpt"),
        navigation("keywords.aiVisibilityModule.aiSearch"),
        navigation("keywords.aiVisibilityModule.promptTracker"),
        navigation("keywords.aiVisibilityModule.promptResearch"),
        navigation("keywords.aiVisibilityModule.brandVisibility"),
      ],
    },
  };
}
