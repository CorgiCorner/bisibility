import { expect, it } from "vitest";
import { mergeMeteringAdminPage } from "./admin-page";
import type { MeteringAdminData } from "./admin-types";
import { adminUsageFixture } from "./shared-view-fixtures";

it.each(["usage", "exceptions"] as const)(
  "replaces only the requested %s snapshot and merges its references",
  (kind) => {
    const previous: MeteringAdminData = {
      ...adminUsageFixture(),
      truncated: true,
      references: { projects: { old: "Existing project" }, connections: {} },
    };
    const next: MeteringAdminData = {
      ...adminUsageFixture(),
      budgetsOmitted: true,
      budgets: [],
      projects: [],
      references: { projects: { next: "Next project" }, connections: {} },
    };
    next.usage = { ...next.usage, asOf: "2026-10-12T12:00:00Z", nextCursor: "usage-next" };
    next.exceptions = {
      ...next.exceptions,
      asOf: "2026-10-12T12:00:00Z",
      nextCursor: "exception-next",
    };
    const merged = mergeMeteringAdminPage(previous, next, kind);
    expect(merged?.[kind]).toBe(next[kind]);
    expect(merged?.[kind === "usage" ? "exceptions" : "usage"]).toBe(
      previous[kind === "usage" ? "exceptions" : "usage"],
    );
    expect(merged?.budgets).toBe(previous.budgets);
    expect(merged?.projects).toBe(previous.projects);
    expect(merged?.truncated).toBe(true);
    expect(merged?.references?.projects).toEqual({ old: "Existing project", next: "Next project" });
  },
);

it.each(["usage", "exceptions"] as const)("accepts a confirmed empty %s page", (kind) => {
  const next: MeteringAdminData = adminUsageFixture();
  if (kind === "usage") next.usage = { ...next.usage, state: "empty", rows: [] };
  else next.exceptions = { ...next.exceptions, state: "empty", rows: [] };
  expect(mergeMeteringAdminPage(adminUsageFixture(), next, kind)?.[kind]).toBe(next[kind]);
});

it.each([
  ["usage", "unavailable"],
  ["usage", "forbidden"],
  ["exceptions", "unavailable"],
  ["exceptions", "forbidden"],
] as const)("rejects typed %s %s even when data exists", (kind, state) => {
  const next = adminUsageFixture();
  const failed = { ...next, [kind]: { ...next[kind], state, rows: [] } };
  expect(mergeMeteringAdminPage(next, failed, kind)).toBeNull();
});
