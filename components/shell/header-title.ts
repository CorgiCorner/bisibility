import {
  GETTING_STARTED_LABEL,
  gettingStartedSubtitle,
} from "@/components/getting-started/getting-started-copy";
import { appSectionPath } from "@/lib/routing/app-path";

export type HeaderMeta = {
  id?: string;
  headerVariant?: "settings";
  subtitle?: string;
  /** Heading shown in the app header. */
  title: string;
};

function matches(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export type HeaderSetupState = Readonly<{
  completed?: boolean;
  totalCount?: number;
}>;

/** Derives the header title and subtitle from the current pathname. */
export function headerMetaFor(pathname: string, setup?: HeaderSetupState): HeaderMeta {
  const sectionPath = appSectionPath(pathname);

  if (matches(sectionPath, "/account/security")) {
    return sectionMeta("Security", "Password, sessions and account protection.");
  }

  if (matches(sectionPath, "/account/preferences")) {
    return sectionMeta("Preferences", "Theme and personal defaults.");
  }

  if (matches(sectionPath, "/account")) {
    return sectionMeta(
      "Account settings",
      "Manage your bisibility user, separate from project settings.",
    );
  }

  if (matches(sectionPath, "/admin/administration")) {
    return sectionMeta(
      "Instance administration",
      "Growth, consumption and account administration.",
    );
  }
  if (matches(sectionPath, "/admin/audit")) {
    return sectionMeta("Instance administration", "Instance administrator activity and outcomes.");
  }

  if (matches(sectionPath, "/admin")) {
    return sectionMeta("Instance administration", "Worker health and operator diagnostics.");
  }

  const projectRunMatch = /^\/runs\/rank-checks\/(rcr_[^/]+)$/u.exec(sectionPath);
  if (projectRunMatch?.[1]) {
    return { id: projectRunMatch[1], title: "Run" };
  }

  if (
    matches(sectionPath, "/schedules") ||
    matches(sectionPath, "/runs/schedules") ||
    matches(sectionPath, "/rank-tracker/schedules")
  )
    return { title: "Schedules" };
  if (matches(sectionPath, "/serp-playground")) return { title: "SERP Playground" };
  if (matches(sectionPath, "/usage")) return { title: "Usage" };

  if (matches(sectionPath, "/runs")) {
    return sectionMeta("Runs", "Rank checks and Search Console imports for this project.");
  }

  const legacyRunMatch = /^\/rank-tracker\/runs\/(rcr_[^/]+)$/u.exec(sectionPath);
  if (legacyRunMatch?.[1]) {
    return { id: legacyRunMatch[1], title: "Run" };
  }

  // The detail page for one keyword. "Keyword" alone sat one letter away from the list it
  // was opened from, so the header read as a truncation rather than a different screen.
  if (matches(sectionPath, "/rank-tracker") && sectionPath !== "/rank-tracker") {
    return { title: "Keyword details" };
  }

  if (matches(sectionPath, "/dashboard") || matches(sectionPath, "/overview")) {
    return { title: "Dashboard" };
  }

  if (matches(sectionPath, "/pages")) {
    return sectionMeta("Pages", "Every URL of the project, one row each.");
  }

  if (matches(sectionPath, "/search-console")) {
    return sectionMeta(
      "Search Console",
      "What Google reported, what it withheld, and what you keep.",
    );
  }

  if (
    matches(sectionPath, "/ai-visibility") ||
    matches(sectionPath, "/prompt-tracker") ||
    matches(sectionPath, "/prompt-research") ||
    matches(sectionPath, "/brand-visibility")
  ) {
    return { title: "AI Visibility" };
  }

  const researchSections = [
    [
      "model-playground",
      "Model Playground",
      "One question, several models. Compare who they name and which pages they cite.",
    ],
    [
      "prompt-playground",
      "Model Playground",
      "One question, several models. Compare who they name and which pages they cite.",
    ],
    ["site-audit", "Site Audit", "Crawl your project site and inspect issues by URL."],
    ["context", "Project Context", "Business, audience, products and goals for your agents."],
    ["agent-reports", "Reports", "Saved analyses shared with members of this project."],
  ] as const;
  for (const [segment, title, subtitle] of researchSections) {
    if (matches(sectionPath, `/${segment}`)) return sectionMeta(title, subtitle);
  }

  if (matches(sectionPath, "/domain-overview")) {
    return sectionMeta("Domain Overview", "Analyze estimated organic visibility for any domain.");
  }

  if (matches(sectionPath, "/rank-tracker")) {
    return { title: "Rank Tracker" };
  }

  if (matches(sectionPath, "/keyword-research")) {
    return sectionMeta(
      "Keyword Research",
      "Find phrases worth tracking, with the cost visible before every lookup.",
    );
  }

  // The rail's Markets row, and the page the market level is chosen from. This module
  // deliberately does not import the nav model, so a new rail destination needs its title added
  // here by hand or the header falls back to "Overview".
  if (matches(sectionPath, "/markets")) {
    return sectionMeta("Markets", "Manage locations, keyword defaults, and market lifecycle.");
  }

  if (matches(sectionPath, "/providers")) {
    return sectionMeta("Providers", "Connect data providers and analytics sources.");
  }

  if (matches(sectionPath, "/getting-started")) {
    return sectionMeta(
      GETTING_STARTED_LABEL,
      gettingStartedSubtitle(setup?.completed ?? false, setup?.totalCount ?? 4),
    );
  }

  if (matches(sectionPath, "/install")) {
    return sectionMeta(
      "Install",
      "Let your AI agent, editor or scripts use the same data you see here.",
    );
  }

  if (matches(sectionPath, "/competitors")) {
    return sectionMeta("Competitors", "Benchmark competitors on your tracked keywords.");
  }

  if (matches(sectionPath, "/backlinks")) {
    return sectionMeta(
      "Backlinks",
      "See who links to a site, what changed, and the cost before every run.",
    );
  }

  if (matches(sectionPath, "/alerts")) {
    return sectionMeta("Alerts", "Get notified when rankings change.");
  }

  if (matches(sectionPath, "/annotations") || matches(sectionPath, "/timeline")) {
    return { title: "Annotations" };
  }

  if (matches(sectionPath, "/settings/audit")) {
    return sectionMeta("Audit log", "Review project changes and security events.");
  }

  if (matches(sectionPath, "/settings/import")) {
    return sectionMeta(
      "Import from another instance",
      "Move data into this project with a one-time migration token.",
    );
  }

  if (matches(sectionPath, "/settings/tags")) {
    return { headerVariant: "settings", title: "Settings" };
  }

  if (matches(sectionPath, "/settings/conversions")) {
    return { headerVariant: "settings", title: "Settings" };
  }

  if (matches(sectionPath, "/settings")) {
    return { headerVariant: "settings", title: "Settings" };
  }

  if (matches(sectionPath, "/docs")) {
    return sectionMeta("Docs", "Install, configure and self-host bisibility.");
  }

  return { title: "Overview" };
}

function sectionMeta(title: string, subtitle: string): HeaderMeta {
  return { subtitle, title };
}
