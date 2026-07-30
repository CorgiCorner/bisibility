import { pluralize } from "@/lib/format/pluralize";
import { appSectionPath } from "@/lib/routing/app-path";

export type HeaderMeta = {
  subtitle?: string;
  /** Heading shown in the app header. */
  title: string;
};

type HeaderContext = {
  keywordCount?: number;
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
      "Manage your bisibility user, separate from workspace settings.",
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

  // A single keyword detail reads as the singular "Keyword".
  if (matches(sectionPath, "/keywords") && sectionPath !== "/keywords") {
    return sectionMeta("Keyword", "Position history, ranking URL and schedule.");
  }

  if (matches(sectionPath, "/overview")) {
    return { title: "Overview" };
  }

  if (matches(sectionPath, "/keywords")) {
    const subtitle =
      keywordCount === 0
        ? "No keywords tracked yet"
        : `${pluralize(keywordCount, "tracked keyword")} · click any row to edit`;
    return sectionMeta("Keywords", subtitle);
  }

  if (matches(sectionPath, "/research")) {
    return sectionMeta(
      "Keyword research",
      "Find phrases worth tracking, with the cost visible before every lookup.",
    );
  }

  if (matches(sectionPath, "/checks")) {
    return sectionMeta(
      "Checks",
      "Operational log of rank-check runs. Keyword details live in Keywords.",
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
    return sectionMeta("Audit log", "Review workspace changes and security events.");
  }

  if (matches(sectionPath, "/settings/import")) {
    return sectionMeta(
      "Import from another instance",
      "Move data into this workspace with a one-time migration token.",
    );
  }

  if (matches(sectionPath, "/settings")) {
    return sectionMeta("Settings", "Workspace, providers, team and preferences.");
  }

  if (matches(sectionPath, "/docs")) {
    return sectionMeta("Docs", "Install, configure and self-host bisibility.");
  }

  return { title: "Overview" };
}

function sectionMeta(title: string, subtitle: string): HeaderMeta {
  return { subtitle, title };
}
