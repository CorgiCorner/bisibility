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
      "AI Visibility": navigation("items.aiVisibility"),
      "AI Tracking": navigation("items.aiTracking"),
      "Prompt Explorer": navigation("items.promptExplorer"),
      "Site Audit": navigation("items.siteAudit"),
      "Project Context": navigation("items.projectContext"),
      "Agent Reports": navigation("items.agentReports"),
      Alerts: navigation("items.alerts"),
      Backlinks: navigation("items.backlinks"),
      Competitors: navigation("items.competitors"),
      Dashboard: navigation("items.dashboard"),
      "Docs and self-hosting": t("navigation.docs"),
      "Domain Overview": navigation("items.domainOverview"),
      Install: navigation("items.install"),
      Integrations: navigation("items.integrations"),
      "Keyword Research": navigation("items.keywordResearch"),
      Markets: navigation("items.markets"),
      "Rank Tracker": navigation("items.rankTracker"),
      Runs: navigation("items.runs"),
      "Search Console": navigation("items.searchConsole"),
      Settings: navigation("items.settings"),
    },
  };
}
