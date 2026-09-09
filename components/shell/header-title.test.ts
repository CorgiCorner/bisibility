import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { headerMetaFor } from "@/components/shell/header-title";
import { appPath, appRootPath, marketPath, resolvedContextPath } from "@/lib/routing/app-path";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import { describe, expect, it } from "vitest";

const routeCases = [
  { path: appRootPath(), pattern: `${appRootPath()}/`, title: "Overview" },
  { path: "/app/account", pattern: "/app/account", title: "Account settings" },
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
    path: appPath("prj_1", "integrations"),
    pattern: appPath("[project]", "integrations"),
    title: "Integrations",
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
    path: appPath("prj_1", "runs", "rank-checks", "rcr_test"),
    pattern: appPath("[project]", "runs", "rank-checks", "[id]"),
    title: "Run",
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
    title: "Runs",
  },
  {
    path: appPath("prj_1", "rank-tracker", "schedules", "sch_test"),
    pattern: appPath("[project]", "rank-tracker", "schedules", "[publicId]"),
    title: "Runs",
  },
  {
    path: projectSchedulesPath("prj_1"),
    pattern: projectSchedulesPath("[project]"),
    title: "Runs",
  },
  {
    path: projectSchedulesPath("prj_1", "sch_test"),
    pattern: projectSchedulesPath("[project]", "[publicId]"),
    title: "Runs",
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
    path: appPath("prj_1", "timeline"),
    pattern: appPath("[project]", "timeline"),
    title: "Timeline",
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
    const appDirectory = resolve(import.meta.dirname, "../../app/app");

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

  it("does not advertise removed timezone preferences", () => {
    expect(headerMetaFor("/app/account/preferences")).toEqual({
      subtitle: "Theme and personal defaults.",
      title: "Preferences",
    });
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

  it("keeps schedules in the project Runs section", () => {
    expect(headerMetaFor(projectSchedulesPath("prj_1"))).toMatchObject({
      title: "Runs",
    });
    expect(headerMetaFor(projectSchedulesPath("prj_1", "sch_test"))).toMatchObject({
      title: "Runs",
    });
  });

  it("keeps Settings free of redundant project-domain metadata", () => {
    expect(headerMetaFor(appPath("prj_1", "settings", "general"))).toEqual({
      headerVariant: "settings",
      title: "Settings",
    });
    expect(headerMetaFor(appPath("prj_1", "integrations"))).toMatchObject({
      subtitle: "Connect data providers and analytics sources.",
      title: "Integrations",
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
