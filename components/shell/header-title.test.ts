import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { headerMetaFor } from "@/components/shell/header-title";
import { ossAdminRoutes } from "@/lib/instance-admin/routes";
import { appPath, appRootPath, marketPath, resolvedContextPath } from "@/lib/routing/app-path";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import { describe, expect, it } from "vitest";

const routeCases = [
  {
    path: appPath("prj_1", "serp-playground"),
    pattern: appPath("[project]", "serp-playground"),
    title: "SERP Playground",
  },
  {
    path: appPath("prj_1", "runs", "summaries", "ntf_test"),
    pattern: appPath("[project]", "runs", "summaries", "[notificationPublicId]"),
    title: "Runs",
  },
  {
    path: appPath("prj_1", "settings", "business-locations"),
    pattern: appPath("[project]", "settings", "business-locations"),
    title: "Settings",
  },
  {
    path: appPath("prj_1", "settings", "business-locations", "monitors"),
    pattern: appPath("[project]", "settings", "business-locations", "monitors"),
    title: "Settings",
  },
  {
    path: appPath("prj_1", "settings", "business-locations", "monitors", "mon_test"),
    pattern: appPath("[project]", "settings", "business-locations", "monitors", "[monitor]"),
    title: "Settings",
  },
  {
    path: appPath("prj_1", "prompt-research"),
    pattern: appPath("[project]", "prompt-research"),
    title: "AI Visibility",
  },
  {
    path: appPath("prj_1", "prompt-tracker"),
    pattern: appPath("[project]", "prompt-tracker"),
    title: "AI Visibility",
  },
  {
    path: appPath("prj_1", "ai-visibility"),
    pattern: appPath("[project]", "ai-visibility"),
    title: "AI Visibility",
  },
  {
    path: appPath("prj_1", "brand-visibility"),
    pattern: appPath("[project]", "brand-visibility"),
    title: "AI Visibility",
  },
  {
    path: appPath("prj_1", "model-playground"),
    pattern: appPath("[project]", "model-playground"),
    title: "Model Playground",
  },
  {
    path: appPath("prj_1", "site-audit"),
    pattern: appPath("[project]", "site-audit"),
    title: "Site Audit",
  },
  {
    path: appPath("prj_1", "context"),
    pattern: appPath("[project]", "context"),
    title: "Project Context",
  },
  {
    path: appPath("prj_1", "agent-reports"),
    pattern: appPath("[project]", "agent-reports"),
    title: "Reports",
  },
  {
    path: appPath("prj_1", "agent-reports", "agr_test"),
    pattern: appPath("[project]", "agent-reports", "[reportId]"),
    title: "Reports",
  },
  {
    path: appPath("prj_1", "agent-reports", "example"),
    pattern: appPath("[project]", "agent-reports", "example"),
    title: "Reports",
  },

  { path: appRootPath(), pattern: `${appRootPath()}/`, title: "Overview" },
  { path: "/app/account", pattern: "/app/account", title: "Account settings" },
  { path: "/app/account/activity", pattern: "/app/account/activity", title: "Account settings" },
  { path: "/app/account/preferences", pattern: "/app/account/preferences", title: "Preferences" },
  { path: "/app/account/security", pattern: "/app/account/security", title: "Security" },
  { path: "/app/admin", pattern: "/app/admin", title: "Instance administration" },
  {
    path: "/app/admin/administration",
    pattern: "/app/admin/administration",
    title: "Instance administration",
  },
  {
    path: "/app/admin/audit",
    pattern: "/app/admin/audit",
    title: "Instance administration",
  },
  { path: "/app/admin/metering", pattern: "/app/admin/metering", title: "Instance administration" },
  {
    path: "/app/admin/metering/recovery",
    pattern: "/app/admin/metering/recovery",
    title: "Instance administration",
  },
  ...ossAdminRoutes
    .filter((route) => route.href !== "/app/admin/audit")
    .map((route) => ({
      path: route.href,
      pattern: route.href,
      title: "Instance administration",
    })),
  { path: "/app/overview", pattern: "/app/overview", title: "Overview" },
  {
    path: appPath("prj_1", "alerts"),
    pattern: appPath("[project]", "alerts"),
    title: "Alerts",
  },
  {
    path: appPath("prj_1", "backlinks"),
    pattern: appPath("[project]", "backlinks"),
    title: "Backlinks",
  },
  {
    path: appPath("prj_1", "competitors"),
    pattern: appPath("[project]", "competitors"),
    title: "Competitors",
  },
  {
    path: appPath("prj_1", "domain-overview"),
    pattern: appPath("[project]", "domain-overview"),
    title: "Domain Overview",
  },
  {
    path: appPath("prj_1", "docs"),
    pattern: appPath("[project]", "docs"),
    title: "Docs",
  },
  {
    path: appPath("prj_1", "providers"),
    pattern: appPath("[project]", "providers"),
    title: "Providers",
  },
  {
    path: appPath("prj_1", "install"),
    pattern: appPath("[project]", "install"),
    title: "Install",
  },
  {
    path: appPath("prj_1", "getting-started"),
    pattern: appPath("[project]", "getting-started"),
    title: "Get set up",
  },
  {
    path: appPath("prj_1", "runs"),
    pattern: appPath("[project]", "runs"),
    title: "Runs",
  },
  {
    path: appPath("prj_1", "runs", "ai", "air_test"),
    pattern: appPath("[project]", "runs", "ai", "[runId]"),
    title: "Runs",
  },
  {
    path: appPath("prj_1", "runs", "rank-checks", "rcr_test"),
    pattern: appPath("[project]", "runs", "rank-checks", "[id]"),
    title: "Run",
  },
  {
    path: appPath("prj_1", "pages"),
    pattern: appPath("[project]", "pages"),
    title: "Pages",
  },
  {
    path: appPath("prj_1", "search-console"),
    pattern: appPath("[project]", "search-console"),
    title: "Search Console",
  },
  {
    path: appPath("prj_1", "gcs-insights"),
    pattern: appPath("[project]", "gcs-insights"),
    title: "Overview",
  },
  {
    path: appPath("prj_1", "rank-tracker", "schedules"),
    pattern: appPath("[project]", "rank-tracker", "schedules"),
    title: "Schedules",
  },
  {
    path: appPath("prj_1", "rank-tracker", "schedules", "sch_test"),
    pattern: appPath("[project]", "rank-tracker", "schedules", "[publicId]"),
    title: "Schedules",
  },
  {
    path: appPath("prj_1", "runs", "schedules"),
    pattern: appPath("[project]", "runs", "schedules"),
    title: "Schedules",
  },
  {
    path: appPath("prj_1", "runs", "schedules", "sch_test"),
    pattern: appPath("[project]", "runs", "schedules", "[publicId]"),
    title: "Schedules",
  },
  {
    path: appPath("prj_1", "usage"),
    pattern: appPath("[project]", "usage"),
    title: "Usage",
  },
  {
    path: projectSchedulesPath("prj_1"),
    pattern: projectSchedulesPath("[project]"),
    title: "Schedules",
  },
  {
    path: projectSchedulesPath("prj_1", "sch_test"),
    pattern: projectSchedulesPath("[project]", "[publicId]"),
    title: "Schedules",
  },
  {
    path: appPath("prj_1", "rank-tracker", "runs", "rcr_test"),
    pattern: appPath("[project]", "rank-tracker", "runs", "[id]"),
    title: "Run",
  },
  {
    path: appPath("prj_1", "rank-tracker", "kw_test"),
    pattern: appPath("[project]", "rank-tracker", "[id]"),
    title: "Keyword details",
  },
  {
    path: appPath("prj_1", "rank-tracker"),
    pattern: appPath("[project]", "rank-tracker"),
    title: "Rank Tracker",
  },
  {
    path: appPath("prj_1", "dashboard"),
    pattern: appPath("[project]", "dashboard"),
    title: "Dashboard",
  },
  {
    path: appPath("prj_1", "overview"),
    pattern: appPath("[project]", "overview"),
    title: "Dashboard",
  },
  {
    path: appPath("prj_1", "keyword-research"),
    pattern: appPath("[project]", "keyword-research"),
    title: "Keyword Research",
  },
  {
    path: appPath("prj_1", "settings", "audit"),
    pattern: appPath("[project]", "settings", "audit"),
    title: "Audit log",
  },
  {
    path: appPath("prj_1", "settings", "billing"),
    pattern: appPath("[project]", "settings", "billing"),
    title: "Settings",
  },
  {
    path: appPath("prj_1", "settings", "competitors"),
    pattern: appPath("[project]", "settings", "competitors"),
    title: "Settings",
  },
  {
    path: appPath("prj_1", "settings", "import"),
    pattern: appPath("[project]", "settings", "import"),
    title: "Import from another instance",
  },
  {
    path: appPath("prj_1", "settings", "markets"),
    pattern: appPath("[project]", "settings", "markets"),
    title: "Settings",
  },
  {
    path: appPath("prj_1", "settings"),
    pattern: appPath("[project]", "settings"),
    title: "Settings",
  },
  {
    path: appPath("prj_1", "settings", "advanced"),
    pattern: appPath("[project]", "settings", "advanced"),
    title: "Settings",
  },
  {
    path: appPath("prj_1", "settings", "data-sources"),
    pattern: appPath("[project]", "settings", "data-sources"),
    title: "Settings",
  },
  {
    path: appPath("prj_1", "settings", "conversions"),
    pattern: appPath("[project]", "settings", "conversions"),
    title: "Settings",
  },
  {
    path: appPath("prj_1", "settings", "developers"),
    pattern: appPath("[project]", "settings", "developers"),
    title: "Settings",
  },
  {
    path: appPath("prj_1", "settings", "experimental"),
    pattern: appPath("[project]", "settings", "experimental"),
    title: "Settings",
  },
  {
    path: appPath("prj_1", "settings", "general"),
    pattern: appPath("[project]", "settings", "general"),
    title: "Settings",
  },
  {
    path: appPath("prj_1", "settings", "notifications"),
    pattern: appPath("[project]", "settings", "notifications"),
    title: "Settings",
  },
  {
    path: appPath("prj_1", "settings", "team"),
    pattern: appPath("[project]", "settings", "team"),
    title: "Settings",
  },
  {
    path: appPath("prj_1", "settings", "tracking"),
    pattern: appPath("[project]", "settings", "tracking"),
    title: "Settings",
  },
  {
    path: appPath("prj_1", "settings", "usage"),
    pattern: appPath("[project]", "settings", "usage"),
    title: "Settings",
  },
  {
    path: appPath("prj_1", "settings", "tags"),
    pattern: appPath("[project]", "settings", "tags"),
    title: "Settings",
  },
  {
    path: appPath("prj_1", "timeline"),
    pattern: appPath("[project]", "timeline"),
    title: "Annotations",
  },
  {
    path: appPath("prj_1", "annotations"),
    pattern: appPath("[project]", "annotations"),
    title: "Annotations",
  },
  {
    path: appPath("prj_1", "markets"),
    pattern: appPath("[project]", "markets"),
    title: "Markets",
  },
  {
    path: marketPath("prj_1", "pmkt_1", "rank-tracker"),
    pattern: marketPath("[project]", "[market]", "rank-tracker"),
    title: "Rank Tracker",
  },
  {
    // Redirect-only routes: they never paint a header, but the section they resolve to must
    // still read correctly through the context segment.
    path: marketPath("prj_1", "pmkt_1", "settings"),
    pattern: marketPath("[project]", "[market]", "[...page]"),
    title: "Settings",
  },
  {
    path: resolvedContextPath("prj_1", "rank-tracker"),
    pattern: resolvedContextPath("[project]", "[...page]"),
    title: "Rank Tracker",
  },
] as const;

function pageRoutePatterns(directory: string, segments: string[] = []): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      // A parallel-route slot renders INTO a layout that some other route already owns. It
      // mints no URL of its own, so it has no page to title.
      if (entry.name.startsWith("@")) {
        return [];
      }
      const nextSegments =
        entry.name.startsWith("(") && entry.name.endsWith(")")
          ? segments
          : [...segments, entry.name];
      return pageRoutePatterns(resolve(directory, entry.name), nextSegments);
    }
    return entry.name === "page.tsx" ? [`/app/${segments.join("/")}`] : [];
  });
}

describe("dashboard header titles", () => {
  it("covers every app page route", () => {
    const appDirectory = resolve(import.meta.dirname, "../../app/(regional)/app");

    expect(routeCases.map((route) => route.pattern).sort()).toEqual(
      pageRoutePatterns(appDirectory).sort(),
    );
  });

  it.each(routeCases)("uses $title for $pattern", ({ path, title }) => {
    expect(headerMetaFor(path).title).toBe(title);
  });

  it("keeps the overview header free of project metadata", () => {
    expect(headerMetaFor(appPath("prj_1", "dashboard"))).toEqual({ title: "Dashboard" });
  });

  it("titles AI Visibility without a subtitle", () => {
    for (const segment of [
      "ai-visibility",
      "prompt-tracker",
      "prompt-research",
      "brand-visibility",
    ]) {
      expect(headerMetaFor(appPath("prj_1", segment))).toEqual({ title: "AI Visibility" });
    }
  });

  it("does not advertise removed timezone preferences", () => {
    expect(headerMetaFor("/app/account/preferences")).toEqual({
      subtitle: "Theme and personal defaults.",
      title: "Preferences",
    });
  });

  it("omits the Annotations subtitle", () => {
    expect(headerMetaFor(appPath("prj_1", "annotations"))).toEqual({ title: "Annotations" });
    expect(headerMetaFor(appPath("prj_1", "timeline"))).toEqual({ title: "Annotations" });
  });

  it("omits the Rank Tracker subtitle", () => {
    expect(headerMetaFor(appPath("prj_1", "rank-tracker"))).toEqual({ title: "Rank Tracker" });
  });

  it("identifies Runs and a rank-check detail before rank-tracker routes", () => {
    expect(headerMetaFor(appPath("prj_1", "runs"))).toEqual({
      title: "Runs",
      subtitle: "Rank checks and Search Console imports for this project.",
    });
    expect(
      headerMetaFor(appPath("prj_1", "runs", "rank-checks", "rcr_abcdefghijklmnopqrstuvwx")),
    ).toEqual({ id: "rcr_abcdefghijklmnopqrstuvwx", title: "Run" });
  });

  it("gives Schedules and Usage their own headers", () => {
    expect(headerMetaFor(projectSchedulesPath("prj_1"))).toEqual({ title: "Schedules" });
    expect(headerMetaFor(projectSchedulesPath("prj_1", "sch_test"))).toEqual({
      title: "Schedules",
    });
    expect(headerMetaFor(appPath("prj_1", "usage"))).toEqual({ title: "Usage" });
  });

  it("keeps Settings free of redundant project-domain metadata", () => {
    expect(headerMetaFor(appPath("prj_1", "settings", "general"))).toEqual({
      headerVariant: "settings",
      title: "Settings",
    });
    expect(headerMetaFor(appPath("prj_1", "providers"))).toMatchObject({
      subtitle: "Connect data providers and analytics sources.",
      title: "Providers",
    });
  });

  it("uses state-aware getting-started metadata", () => {
    expect(headerMetaFor(appPath("prj_1", "getting-started"))).toEqual({
      subtitle: "Four steps to your first positions.",
      title: "Get set up",
    });
    expect(
      headerMetaFor(appPath("prj_1", "getting-started"), { completed: true, totalCount: 4 }),
    ).toEqual({
      subtitle: "Done. Everything below is optional.",
      title: "Get set up",
    });
  });

  it("keeps the header title correct under a market segment", () => {
    // Inserting a segment silently shifted the section index before; both surfaces that
    // match section literals must still see the same section.
    expect(headerMetaFor(marketPath("prj_1", "pmkt_1", "rank-tracker"))).toEqual({
      title: "Rank Tracker",
    });
    expect(headerMetaFor(marketPath("prj_1", "pmkt_1", "rank-tracker", "kw_1"))).toEqual({
      title: "Keyword details",
    });
    expect(headerMetaFor(marketPath("prj_1", "pmkt_1", "settings", "audit"))).toEqual({
      subtitle: "Review project changes and security events.",
      title: "Audit log",
    });
    expect(headerMetaFor(resolvedContextPath("prj_1", "competitors"))).toMatchObject({
      title: "Competitors",
    });
  });

  it("names the markets route the rail points at", () => {
    // The rail gained a Markets row and the market routing work gave it a page; the title has
    // to exist here by hand or that row lands on a header that reads "Overview".
    expect(headerMetaFor(appPath("prj_1", "markets"))).toEqual({
      subtitle: "Manage locations, keyword defaults, and market lifecycle.",
      title: "Markets",
    });
    // A settings subsection called markets is Settings, not the rail destination.
    expect(headerMetaFor(appPath("prj_1", "settings", "markets")).title).toBe("Settings");
    // And the rail destination still reads as itself one level down, inside a market.
    expect(headerMetaFor(marketPath("prj_1", "pmkt_1", "markets")).title).toBe("Markets");
  });

  it("uses descriptive Install copy", () => {
    expect(headerMetaFor("/app/prj_x/install")).toEqual({
      subtitle: "Let your AI agent, editor or scripts use the same data you see here.",
      title: "Install",
    });
  });
});
