import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const root = process.cwd();
const historicalPlanner = "lib/rank-check/schedules/migrate.ts";
const unrelatedDefaults = new Set([
  "app/(regional)/app/page.tsx",
  "app/(regional)/install/page.tsx",
  "app/(regional)/onboarding/page.tsx",
  "lib/queries/workspaces.ts",
  "components/dashboard-layout/DashboardCustomizationDialog.stories.tsx",
  "components/marketing/features/story/FeatureStory.tsx",
  "components/marketing/features/story/StoryStep.tsx",
  "components/marketing/features/story/StoryStepMarker.tsx",
]);

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "generated" ? [] : sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.(test|stories)\./.test(entry.name) ? [path] : [];
  });
}

describe("no default rank schedule", () => {
  it("allows only definition payload compatibility outside offline migration history", () => {
    const violations: string[] = [];
    for (const path of ["lib", "app", "components"].flatMap((dir) => sources(join(root, dir)))) {
      const name = relative(root, path);
      if (
        name === historicalPlanner ||
        name.startsWith("components/shell/") ||
        unrelatedDefaults.has(name)
      )
        continue;
      const text = readFileSync(path, "utf8");
      const hits = text.match(/\bisDefault\b/g) ?? [];
      if (name === "lib/measurement-definitions/schema.ts") {
        expect(hits).toHaveLength(1);
        expect(text).toContain("isDefault: z.boolean().optional()");
        expect(text).not.toMatch(/\.isDefault\b/);
      } else if (name === "lib/measurement-definitions/fixtures.ts") {
        expect(hits).toHaveLength(1);
        expect(text).toContain("isDefault: false");
        expect(text).not.toMatch(/\.isDefault\b/);
      } else if (hits.length) violations.push(name);
    }
    expect(violations).toEqual([]);
  });

  it("removes the route, action, service and audit declaration", async () => {
    expect(existsSync(join(root, "app/api/check-schedules/[publicId]/set-default/route.ts"))).toBe(
      false,
    );
    for (const [path, symbol] of [
      ["lib/actions/check-schedule.ts", "setDefaultCheckSchedule"],
      ["lib/rank-check/schedules/service.ts", "setDefaultSchedule"],
      ["lib/auth/audit-field-declarations-extra.ts", "check_schedule.set_default"],
    ])
      expect(readFileSync(join(root, path), "utf8")).not.toContain(symbol);
  });
});
