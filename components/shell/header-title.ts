import { pluralize } from "@/lib/format/pluralize";
import { appSectionPath } from "@/lib/routing/app-path";

export type HeaderMeta = {
  subtitle?: string;
  subtitleVariant?: "project-domain";
  /** Heading shown in the app header. */
  title: string;
};

type HeaderContext = {
  keywordCount?: number;
  projectDomain?: string | null;
};

function matches(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** Derives the header title and subtitle from the current pathname. */
export function headerMetaFor(pathname: string, context: HeaderContext = {}): HeaderMeta {
  const sectionPath = appSectionPath(pathname);
  const keywordCount = context.keywordCount ?? 248;

  if (matches(sectionPath, "/account/security")) {
    return sectionMeta("Security", "Password, sessions and account protection.");
  }

  if (matches(sectionPath, "/account/preferences")) {
    return sectionMeta("Preferences", "Theme, timezone and personal defaults.");
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

  if (sectionPath === "/admin") {
    return sectionMeta("Instance administration", "Worker health and operator diagnostics.");
  }

  // The detail page for one keyword. "Keyword" alone sat one letter away from the list it
  // was opened from, so the header read as a truncation rather than a different screen.
  if (matches(sectionPath, "/rank-tracker") && sectionPath !== "/rank-tracker") {
    return sectionMeta("Keyword details", "Position history, ranking URL and schedule.");
  }

  if (matches(sectionPath, "/overview")) {
    return { title: "Dashboard" };
  }

  if (matches(sectionPath, "/domain-overview")) {
    return sectionMeta("Domain Overview", "Analyze estimated organic visibility for any domain.");
  }

  if (matches(sectionPath, "/rank-tracker")) {
    const subtitle =
      keywordCount === 0
        ? "No keywords tracked yet"
        : `${pluralize(keywordCount, "tracked keyword")} · click any row to edit`;
    return sectionMeta("Rank Tracker", subtitle);
  }

  if (matches(sectionPath, "/research")) {
    return sectionMeta(
      "Keyword Research",
      "Find phrases worth tracking, with the cost visible before every lookup.",
    );
  }

  if (matches(sectionPath, "/checks")) {
    return sectionMeta(
      "Checks",
      "Operational log of rank-check runs. Keyword details live in Rank Tracker.",
    );
  }

  if (matches(sectionPath, "/integrations")) {
    return sectionMeta("Integrations", "Connect data providers and analytics sources.");
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

  if (matches(sectionPath, "/timeline")) {
    return sectionMeta("Timeline", "Project signals, page changes and notes over time.");
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

  if (matches(sectionPath, "/settings")) {
    return {
      subtitle: context.projectDomain?.trim() || "No domain set",
      subtitleVariant: "project-domain",
      title: "Settings",
    };
  }

  if (matches(sectionPath, "/docs")) {
    return sectionMeta("Docs", "Install, configure and self-host bisibility.");
  }

  return { title: "Overview" };
}

function sectionMeta(title: string, subtitle: string): HeaderMeta {
  return { subtitle, title };
}
