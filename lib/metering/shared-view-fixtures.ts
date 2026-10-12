import type { BudgetRow } from "@usagekit/views";
import { headerStatusFromBudgets } from "@usagekit/views";
import { emptyProjectUsage } from "./user-views";
export function budgetFixture(used = "62", unit = "units"): BudgetRow {
  const amount = (text: string) => ({ text, unit, certainty: "measured" as const });
  return {
    id: "public-budget",
    version: 1,
    kind: "group",
    target: "project",
    traffic: { kind: "any" },
    window: "calendar_month",
    unit,
    used: amount(used),
    reserved: amount("0"),
    remaining: amount("38"),
    limit: amount("100"),
    boundary: { onExceed: "block" },
    alerts: [],
    bar: null,
    warningAt: null,
    epoch: "2026-10-01",
    resetsAt: "2026-11-01T00:00:00Z",
    redacted: false,
    level: "ok",
  };
}
export function headerFixture(rows: BudgetRow[] = [budgetFixture()]) {
  const budgets = {
    state: rows.length ? ("ok" as const) : ("empty" as const),
    rows,
    problem: null,
  };
  return {
    eligible: true,
    budgets,
    status: headerStatusFromBudgets(budgets),
    paidWorkBlocked: rows.some(
      (row) => row.boundary.onExceed === "block" && row.level === "exceeded",
    ),
  };
}
export function projectUsageFixture() {
  const data = emptyProjectUsage(new Date("2026-10-11T12:00:00Z"));
  data.status = "available";
  data.connections = [{ connectionId: "conn_example", provider: "DataForSEO" }];
  data.budgets = [budgetFixture()];
  const cost = { text: "12.3456", unit: "cents", certainty: "measured" as const };
  data.summary = {
    ...data.summary,
    state: "ok",
    complete: true,
    cost,
    measurements: { requests: { text: "3", unit: "requests", certainty: "measured" } },
    funding: [
      {
        key: "funding-0",
        costOwner: "",
        fundingSource: "byok",
        cost,
        measurements: {},
        unknownOperations: "0",
      },
    ],
    asOf: data.to,
    pages: 1,
    rowCount: 1,
    unknownOperations: "0",
  };
  data.detail = {
    ...data.detail,
    state: "ok",
    asOf: data.to,
    rows: [
      {
        key: "usage-0",
        costOwner: "",
        dimensions: {
          connection: "conn_example",
          provider: "DataForSEO",
          surface: "app",
          source: "app",
        },
        fundingSource: "byok",
        cost,
        units: { units: { text: "3", unit: "units", certainty: "measured" } },
        certainty: "measured",
        unknownOperations: "0",
      },
    ],
  };
  return data;
}
export function adminUsageFixture() {
  const data = projectUsageFixture();
  return {
    usage: data.detail,
    budgets: data.budgets,
    exceptions: {
      state: "empty" as const,
      rows: [],
      nextCursor: null,
      asOf: data.to,
      problem: null,
    },
    projects: ["project"],
    truncated: false,
  };
}
