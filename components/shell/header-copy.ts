import type { HeaderMeta } from "@/components/shell/header-title";
import type { useTranslations } from "next-intl";

type HeaderTranslations = ReturnType<typeof useTranslations<"shell.header">>;

const titleKeys = {
  "AI Visibility": "titles.aiVisibility",
  "AI Tracking": "titles.aiTracking",
  "Prompt Explorer": "titles.promptExplorer",
  "Site Audit": "titles.siteAudit",
  "Project Context": "titles.projectContext",
  "Agent Reports": "titles.agentReports",
  "Account settings": "titles.account",
  Alerts: "titles.alerts",
  "Audit log": "titles.audit",
  Backlinks: "titles.backlinks",
  Competitors: "titles.competitors",
  Dashboard: "titles.dashboard",
  Docs: "titles.docs",
  "Domain Overview": "titles.domainOverview",
  "Get set up": "titles.gettingStarted",
  Integrations: "titles.integrations",
  Install: "titles.install",
  "Keyword details": "titles.keywordDetails",
  "Keyword Research": "titles.keywordResearch",
  Markets: "titles.markets",
  Overview: "titles.overview",
  Preferences: "titles.preferences",
  "Rank Tracker": "titles.rankTracker",
  Run: "titles.run",
  Runs: "titles.runs",
  "Search Console": "titles.searchConsole",
  Security: "titles.security",
  Settings: "titles.settings",
  Timeline: "titles.timeline",
  "Import from another instance": "titles.importFromAnotherInstance",
  "Instance administration": "titles.instanceAdministration",
} as const;

const subtitleKeys = {
  "Monitor AI answers, brand mentions and cited sources over time.": "subtitles.aiTracking",
  "Brand mentions and citations from available provider observations.": "subtitles.aiVisibility",
  "Compare synthetic prompt tests across supported models.": "subtitles.promptExplorer",
  "Crawl your project site and inspect issues by URL.": "subtitles.siteAudit",
  "Business, audience, products and goals for your agents.": "subtitles.projectContext",
  "Saved analyses shared with members of this project.": "subtitles.agentReports",
  "Manage your bisibility user, separate from project settings.": "subtitles.account",
  "Get notified when rankings change.": "subtitles.alerts",
  "Review project changes and security events.": "subtitles.audit",
  "See who links to a site, what changed, and the cost before every run.": "subtitles.backlinks",
  "Benchmark competitors on your tracked keywords.": "subtitles.competitors",
  "Install, configure and self-host bisibility.": "subtitles.docs",
  "Analyze estimated organic visibility for any domain.": "subtitles.domainOverview",
  "Connect data providers and analytics sources.": "subtitles.integrations",
  "Let your AI agent, editor or scripts use the same data you see here.": "subtitles.install",
  "Growth, consumption and account administration.": "subtitles.instanceAdministration",
  "Instance administrator activity and outcomes.": "subtitles.instanceAdministrationAudit",
  "Worker health and operator diagnostics.": "subtitles.instanceAdministrationOverview",
  "Find phrases worth tracking, with the cost visible before every lookup.":
    "subtitles.keywordResearch",
  "Manage locations, keyword defaults, and market lifecycle.": "subtitles.markets",
  "Theme and personal defaults.": "subtitles.preferences",
  "Rank checks and Search Console imports for this project.": "subtitles.runs",
  "What Google reported, what it withheld, and what you keep.": "subtitles.searchConsole",
  "Password, sessions and account protection.": "subtitles.security",
  "Project signals, page changes and notes over time.": "subtitles.timeline",
  "Move data into this project with a one-time migration token.":
    "subtitles.importFromAnotherInstance",
} as const;

/** Localizes shell-owned route metadata without passing route copy through raw. */
export function localizedHeaderMeta(
  t: HeaderTranslations,
  meta: HeaderMeta,
  setupCompleted: boolean,
) {
  const titleKey = titleKeys[meta.title as keyof typeof titleKeys];
  const subtitleKey = meta.subtitle
    ? subtitleKeys[meta.subtitle as keyof typeof subtitleKeys]
    : undefined;
  if (!titleKey || (meta.subtitle && meta.title !== "Get set up" && !subtitleKey)) {
    throw new Error(`Missing shell header copy for ${meta.title}`);
  }
  return {
    ...meta,
    subtitle:
      meta.title === "Get set up"
        ? t(
            setupCompleted
              ? "subtitles.gettingStartedComplete"
              : "subtitles.gettingStartedIncomplete",
          )
        : subtitleKey
          ? t(subtitleKey)
          : undefined,
    title: t(titleKey),
  };
}
