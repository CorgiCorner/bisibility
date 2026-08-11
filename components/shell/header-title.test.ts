import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { headerMetaFor } from "@/components/shell/header-title";
import { appPath, appRootPath } from "@/lib/routing/app-path";
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
    path: appPath("prj_1", "checks"),
    pattern: appPath("[project]", "checks"),
    title: "Checks",
  },
  {
    path: appPath("prj_1", "competitors"),
    pattern: appPath("[project]", "competitors"),
    title: "Competitors",
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
    path: appPath("prj_1", "keywords", "kw_test"),
    pattern: appPath("[project]", "keywords", "[id]"),
    title: "Keyword details",
  },
  {
    path: appPath("prj_1", "keywords"),
    pattern: appPath("[project]", "keywords"),
    title: "Keywords",
  },
  {
    path: appPath("prj_1", "overview"),
    pattern: appPath("[project]", "overview"),
    title: "Overview",
  },
  {
    path: appPath("prj_1", "research"),
    pattern: appPath("[project]", "research"),
    title: "Keyword research",
  },
  {
    path: appPath("prj_1", "settings", "audit"),
    pattern: appPath("[project]", "settings", "audit"),
    title: "Audit log",
  },
  {
    path: appPath("prj_1", "settings", "import"),
    pattern: appPath("[project]", "settings", "import"),
    title: "Import from another instance",
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
    path: appPath("prj_1", "settings", "developers"),
    pattern: appPath("[project]", "settings", "developers"),
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
] as const;

function pageRoutePatterns(directory: string, segments: string[] = []): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
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
    expect(headerMetaFor(appPath("prj_1", "overview"))).toEqual({ title: "Overview" });
  });

  it("uses singular keyword copy for one tracked keyword", () => {
    expect(headerMetaFor(appPath("prj_1", "keywords"), { keywordCount: 1 }).subtitle).toBe(
      "1 tracked keyword · click any row to edit",
    );
  });

  it("describes checks without implementation details", () => {
    expect(headerMetaFor(appPath("prj_1", "checks"))).toMatchObject({
      subtitle: "Operational log of rank-check runs. Keyword details live in Keywords.",
      title: "Checks",
    });
  });

  it("uses the current project domain for Settings without changing other route metadata", () => {
    expect(
      headerMetaFor(appPath("prj_1", "settings", "general"), { projectDomain: "example.com" }),
    ).toMatchObject({ subtitle: "example.com", title: "Settings" });
    expect(headerMetaFor(appPath("prj_1", "integrations"))).toMatchObject({
      subtitle: "Connect data providers and analytics sources.",
      title: "Integrations",
    });
  });
});
