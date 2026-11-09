import { composeStories } from "@storybook/react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { expect, it } from "vitest";
import * as stories from "./OssComposition.stories";

const { OverviewSort, AuditSort, RecoverySort } = composeStories(
  stories as unknown as Parameters<typeof composeStories>[0],
) as unknown as Record<string, ComponentType>;
type SortCase = { id: string; column: RegExp; ascending: string[]; descending: string[] };

// Ties preserve source order in both directions. Undefined values use the column's
// explicit placement; empty strings use the table's ordinary text comparator.
function assertSort(
  table: HTMLElement,
  column: RegExp,
  identify: (row: HTMLElement) => string,
  expected: SortCase,
) {
  const header = within(table).getByRole("columnheader", { name: column });
  const button = within(header).getByRole("button", { name: /^(Sort|Clear)/ });
  const order = () => within(table).getAllByRole("row").slice(1).map(identify);
  for (let i = 0; i < 3 && header.getAttribute("aria-sort") !== "ascending"; i++)
    fireEvent.click(button);
  expect(header).toHaveAttribute("aria-sort", "ascending");
  expect(order()).toEqual(expected.ascending);
  fireEvent.click(button);
  expect(header).toHaveAttribute("aria-sort", "descending");
  expect(order()).toEqual(expected.descending);
}
const schedules: SortCase[] = [
  {
    id: "O075",
    column: /Task/i,
    ascending: ["a", "b", "c", "z"],
    descending: ["z", "c", "b", "a"],
  },
  {
    id: "O077",
    column: /Missed starts/i,
    ascending: ["c", "a", "b", "z"],
    descending: ["z", "a", "b", "c"],
  },
  {
    id: "O079",
    column: /Skipped while busy/i,
    ascending: ["c", "z", "a", "b"],
    descending: ["a", "b", "z", "c"],
  },
];
it.each(schedules)("$id sorts schedule rows in both directions", (scenario) => {
  render(<OverviewSort />);
  fireEvent.click(screen.getByRole("button", { name: "Operations" }));
  const table = screen.getByRole("table", { name: "Recorded schedule counters" });
  assertSort(
    table,
    scenario.column,
    (row) => row.textContent?.match(/sort-([abcz])/)?.[1] ?? "?",
    scenario,
  );
});
const ops: SortCase[] = [
  {
    id: "O089",
    column: /Kind/i,
    ascending: ["b", "c", "a", "d"],
    descending: ["d", "a", "b", "c"],
  },
  {
    id: "O091",
    column: /Severity/i,
    ascending: ["d", "a", "b", "c"],
    descending: ["b", "c", "a", "d"],
  },
  {
    id: "O093",
    column: /Created/i,
    ascending: ["d", "b", "c", "a"],
    descending: ["a", "b", "c", "d"],
  },
  {
    id: "O095",
    column: /Delivery/i,
    ascending: ["a", "d", "b", "c"],
    descending: ["b", "c", "a", "d"],
  },
  {
    id: "O097",
    column: /Attempts/i,
    ascending: ["b", "c", "d", "a"],
    descending: ["a", "c", "d", "b"],
  },
];
it.each(ops)("$id sorts operational events in both directions", (scenario) => {
  render(<OverviewSort />);
  fireEvent.click(screen.getByRole("button", { name: "Operations" }));
  fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
  const table = screen.getByRole("table", { name: "Recent operational events" });
  assertSort(
    table,
    scenario.column,
    (row) => {
      const cells = within(row).getAllByRole("cell");
      const kind = cells[0].textContent;
      const attempts = cells[4].textContent;
      return kind === "sort-b" ? "a" : kind === "sort-z" ? "d" : attempts === "2" ? "b" : "c";
    },
    scenario,
  );
});
const audit: SortCase[] = [
  {
    id: "T006",
    column: /Time/i,
    ascending: ["d", "b", "c", "a"],
    descending: ["a", "b", "c", "d"],
  },
  {
    id: "T008",
    column: /Actor/i,
    ascending: ["d", "c", "b", "a"],
    descending: ["a", "b", "c", "d"],
  },
  {
    id: "T010",
    column: /Action/i,
    ascending: ["d", "a", "b", "c"],
    descending: ["b", "c", "a", "d"],
  },
  {
    id: "T012",
    column: /Target$/i,
    ascending: ["c", "b", "a", "d"],
    descending: ["d", "a", "b", "c"],
  },
  {
    id: "T014",
    column: /Result/i,
    ascending: ["a", "c", "d", "b"],
    descending: ["b", "c", "d", "a"],
  },
];
it.each(audit)("$id sorts audit entries in both directions", (scenario) => {
  render(<AuditSort />);
  const table = screen.getByRole("table", { name: "Instance administrator activity" });
  assertSort(
    table,
    scenario.column,
    (row) =>
      row.textContent?.includes("target-z")
        ? "a"
        : row.textContent?.includes("target-b")
          ? "b"
          : row.textContent?.includes("target-a")
            ? "c"
            : "d",
    scenario,
  );
});

const auditTargetType: SortCase = {
  id: "audit-target-type",
  column: /Target type/i,
  ascending: ["a", "b", "c", "d"],
  descending: ["d", "a", "b", "c"],
};
it("sorts audit target types in both directions", () => {
  render(<AuditSort />);
  assertSort(
    screen.getByRole("table", { name: "Instance administrator activity" }),
    auditTargetType.column,
    (row) =>
      row.textContent?.includes("target-z")
        ? "a"
        : row.textContent?.includes("target-b")
          ? "b"
          : row.textContent?.includes("target-a")
            ? "c"
            : "d",
    auditTargetType,
  );
});
const recovery: SortCase[] = [
  {
    id: "R045",
    column: /Project/i,
    ascending: ["d", "b", "c", "a"],
    descending: ["a", "b", "c", "d"],
  },
  {
    id: "R047",
    column: /Provider$/i,
    ascending: ["d", "a", "c", "b"],
    descending: ["b", "a", "c", "d"],
  },
  {
    id: "R049",
    column: /Provider request/i,
    ascending: ["a", "d", "b", "c"],
    descending: ["b", "c", "d", "a"],
  },
  {
    id: "R051",
    column: /Result$/i,
    ascending: ["a", "b", "c", "d"],
    descending: ["d", "b", "c", "a"],
  },
  {
    id: "R055",
    column: /Evidence classification/i,
    ascending: ["b", "c", "a", "d"],
    descending: ["a", "b", "c", "d"],
  },
  {
    id: "R057",
    column: /Acceptance \/ recovery/i,
    ascending: ["a", "c", "b", "d"],
    descending: ["b", "a", "c", "d"],
  },
  {
    id: "R059",
    column: /Incident/i,
    ascending: ["c", "b", "a", "d"],
    descending: ["a", "b", "c", "d"],
  },
  {
    id: "R061",
    column: /Lookup attempts/i,
    ascending: ["b", "a", "c", "d"],
    descending: ["c", "a", "b", "d"],
  },
  {
    id: "R063",
    column: /Follow-up/i,
    ascending: ["b", "a", "d", "c"],
    descending: ["c", "a", "d", "b"],
  },
];
function recoveryId(row: HTMLElement) {
  const label = within(row).getByRole("checkbox").getAttribute("aria-label") ?? "";
  return label.includes("sort-z")
    ? "a"
    : label.includes("sort-a")
      ? row.textContent?.includes("Historical uncertainty")
        ? "c"
        : "b"
      : "d";
}
it.each(recovery)("$id sorts recovery cases in both directions", (scenario) => {
  render(<RecoverySort />);
  const table = screen.getByRole("table", { name: "Task recovery" });
  assertSort(table, scenario.column, recoveryId, scenario);
});
const evidence: SortCase[] = [
  {
    id: "R117",
    column: /Project \/ check/i,
    ascending: ["d", "b", "c", "a"],
    descending: ["a", "b", "c", "d"],
  },
  {
    id: "R119",
    column: /Result/i,
    ascending: ["b", "c", "a", "d"],
    descending: ["a", "d", "b", "c"],
  },
  {
    id: "R121",
    column: /Checked depth/i,
    ascending: ["a", "c", "b", "d"],
    descending: ["b", "a", "c", "d"],
  },
  {
    id: "R123",
    column: /Retained at/i,
    ascending: ["c", "d", "a", "b"],
    descending: ["a", "b", "d", "c"],
  },
];
it.each(evidence)("$id sorts partial evidence in both directions", (scenario) => {
  render(<RecoverySort />);
  const table = screen.getByRole("table", { name: "Partial and unresolved evidence" });
  assertSort(
    table,
    scenario.column,
    (row) => within(row).getByRole("link").getAttribute("href")?.slice(-1) ?? "?",
    scenario,
  );
});
