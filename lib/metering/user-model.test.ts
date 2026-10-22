import type { BudgetStatus, Operation } from "@usagekit/core";
import { headerStatusFromBudgets } from "@usagekit/views";
import { describe, expect, it } from "vitest";
import {
  projectBudgetId,
  projectFundingBudgetId,
  projectFundingTag,
} from "./project-funding-budgets";
import { projectBudgetFiguresKnown, projectBudgetRow } from "./user-model";

const budget: BudgetStatus = {
  budget: {
    id: "private-budget",
    version: 1,
    scope: { kind: "group", namespace: "n", group: "g" },
    surface: "worker",
    unit: "cents",
    limit: { value: 10000n, scale: 4, unit: "cents" },
    hardLimit: { value: 20000n, scale: 4, unit: "cents" },
    onExceed: "allow",
    window: { kind: "calendar_month", timezone: "UTC" },
  },
  epoch: {
    epoch: "private-epoch",
    startsAt: "2026-10-01T00:00:00.000Z",
    endsAt: "2026-11-01T00:00:00.000Z",
  },
  used: { value: 15000n, scale: 4, unit: "cents" },
  reserved: { value: 1000n, scale: 4, unit: "cents" },
  remaining: { value: -6000n, scale: 4, unit: "cents" },
};

const unusedProjectBudget: BudgetStatus = {
  ...budget,
  budget: {
    ...budget.budget,
    surface: "any",
    unit: "budget_cents",
    limit: { value: 50000000n, scale: 4, unit: "budget_cents" },
    hardLimit: undefined,
    onExceed: "block",
  },
  used: { value: 0n, scale: 4, unit: "budget_cents" },
  reserved: { value: 0n, scale: 4, unit: "budget_cents" },
  remaining: { value: 50000000n, scale: 4, unit: "budget_cents" },
};

describe("project Meter display boundary", () => {
  it("shows an authoritative unused project cap in both the card and header", () => {
    const known = projectBudgetFiguresKnown(unusedProjectBudget, [], "owner", true);
    expect(known).toBe(true);
    const row = projectBudgetRow(unusedProjectBudget, null, known);
    expect(row).toMatchObject({
      used: { text: "0" },
      reserved: { text: "0" },
      remaining: { text: "5000" },
      level: "ok",
    });
    expect(
      headerStatusFromBudgets({ state: "ok", rows: row ? [row] : [], problem: null }),
    ).toMatchObject({
      hidden: 0,
      bounds: [{ remaining: { text: "5000" }, level: "ok" }],
    });
  });
  it("requires a complete epoch read to show an unused project cap", () => {
    expect(projectBudgetFiguresKnown(unusedProjectBudget, [], "owner", false)).toBe(false);
  });
  it.each([
    { used: null },
    { reserved: null },
    { used: { value: 1n, scale: 4, unit: "budget_cents" } },
    { reserved: { value: 1n, scale: 4, unit: "budget_cents" } },
    { used: { value: 0n, scale: 4, unit: "cents" } },
    { reserved: { value: 0n, scale: 4, unit: "cents" } },
    { redacted: true as const },
  ])("keeps missing, nonzero or redacted counters unknown (case %#)", (change) => {
    expect(
      projectBudgetFiguresKnown({ ...unusedProjectBudget, ...change }, [], "owner", true),
    ).toBe(false);
  });
  it("keeps unobserved provider usage and connection allocations unknown", () => {
    expect(projectBudgetFiguresKnown(budget, [], "owner", true)).toBe(false);
    expect(
      projectBudgetFiguresKnown(
        {
          ...unusedProjectBudget,
          budget: {
            ...unusedProjectBudget.budget,
            scope: { kind: "connection", namespace: "n", connection: "private" },
          },
        },
        [],
        "owner",
        true,
      ),
    ).toBe(false);
  });
  it("preserves negative budget remainder and distinguishes warning from hard limit", () => {
    expect(projectBudgetRow(budget, "prc_public", true)).toMatchObject({
      kind: "group",
      target: "project",
      remaining: { text: "-0.6" },
      boundary: { onExceed: "allow", hardLimit: { text: "2" } },
    });
    expect(JSON.stringify(projectBudgetRow(budget, null))).not.toMatch(/private-/);
  });
  it("omits shared and redacted bounds completely", () => {
    expect(projectBudgetRow({ ...budget, redacted: true }, null)).toBeNull();
    for (const scope of [
      { kind: "principal", namespace: "n", principal: "p" },
      { kind: "tag", namespace: "n", tag: "shared" },
      { kind: "platform_pool", namespace: "n", poolId: "private" },
      {
        kind: "access_credential",
        namespace: "n",
        accessCredential: { kind: "api_key", id: "private" },
      },
    ] as const)
      expect(projectBudgetRow({ ...budget, budget: { ...budget.budget, scope } }, null)).toBeNull();
  });
});

it("attaches separate authorized labels without changing figures or exposing redacted scopes", () => {
  const display = { projectName: "Project · branch", providerLabel: "Provider" };
  const plain = projectBudgetRow(budget, null, true);
  const labeled = projectBudgetRow(budget, null, true, null, undefined, undefined, display);
  expect(labeled).toEqual({ ...plain, display: { projectName: display.projectName } });
  const connection = {
    ...budget,
    budget: {
      ...budget.budget,
      scope: { kind: "connection" as const, namespace: "n", connection: "c" },
    },
  };
  expect(
    projectBudgetRow(connection, "conn_public", true, null, undefined, undefined, display)?.display,
  ).toEqual(display);
  expect(
    projectBudgetRow(
      { ...budget, redacted: true },
      null,
      true,
      null,
      undefined,
      undefined,
      display,
    ),
  ).toBeNull();
});

describe("project funding limits", () => {
  const ownStatus = (tag = projectFundingTag("byok", "g")): BudgetStatus => ({
    ...unusedProjectBudget,
    budget: {
      ...unusedProjectBudget.budget,
      id: projectFundingBudgetId("byok", "g"),
      scope: { kind: "tag", namespace: "n", tag },
    },
    used: { value: 20000n, scale: 4, unit: "budget_cents" },
  });
  const operation = (fundingSource: "byok" | "platform", budgetId: string) =>
    ({
      scope: { namespace: "n", principal: "owner", group: "g", connection: "c" },
      fundingSource,
      budgetEpochs: [
        { budgetId, budgetVersion: 1, epoch: "private-epoch", startsAt: "", endsAt: null },
      ],
    }) as unknown as Operation;

  it("projects a split project limit as a project-wide row", () => {
    expect(projectBudgetRow(ownStatus(), "conn_public", true)).toMatchObject({
      id: "project:any:budget_cents",
      kind: "group",
      used: { text: "2" },
    });
  });

  it("rejects a funding budget id on another tag", () => {
    expect(projectBudgetRow(ownStatus(projectFundingTag("platform", "g")), null, true)).toBeNull();
  });

  it("proves opening usage from the same source's work on the group cap", () => {
    const group = projectBudgetId("g");
    expect(projectBudgetFiguresKnown(ownStatus(), [operation("byok", group)], "owner", true)).toBe(
      true,
    );
    // Credits work on the shared cap never counts toward the your-key limit.
    expect(
      projectBudgetFiguresKnown(ownStatus(), [operation("platform", group)], "owner", true),
    ).toBe(false);
  });
});
