import { renderWithInstanceAdminMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { evidenceRecoveryFixture } from "@/lib/metering/recovery/evidence-view-fixture";
import { adminUsageFixture, budgetFixture } from "@/lib/metering/shared-view-fixtures";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminMeteringView } from "./AdminMeteringView";
import { RecoveryPartialEvidence } from "./recovery/RecoveryPartialEvidence";
import { RecoveryTable } from "./recovery/RecoveryTable";

vi.mock("@/lib/actions/metering-admin", () => ({ loadMeteringAdminPageAction: vi.fn() }));

function assertDataHeadersSort(table: HTMLElement, ignored: string[] = []) {
  for (const header of within(table).getAllByRole("columnheader")) {
    if (ignored.includes(header.textContent?.trim() ?? "")) continue;
    expect(within(header).getByRole("button", { name: /^Sort / })).toBeVisible();
  }
}

describe("admin table sorting", () => {
  it("sorts every metering column and keeps missing cost and redacted budgets unknown", () => {
    const data = adminUsageFixture();
    const sample = data.usage.rows[0];
    data.usage.rows = [
      {
        ...sample,
        key: "zeta",
        dimensions: { ...sample.dimensions, connection: "conn_zeta" },
        cost: { text: "10", unit: "cents", certainty: "measured" },
      },
      {
        ...sample,
        key: "alpha",
        dimensions: { ...sample.dimensions, connection: "conn_alpha" },
        cost: { text: "2", unit: "cents", certainty: "measured" },
      },
      {
        ...sample,
        key: "unknown",
        dimensions: { ...sample.dimensions, connection: "conn_unknown" },
        cost: { text: "", unit: "cents", certainty: "unknown" },
      },
    ];
    data.budgets = [
      { ...budgetFixture("10"), id: "budget-zeta", target: "project-zeta" },
      { ...budgetFixture("2"), id: "budget-alpha", target: "project-alpha" },
      { ...budgetFixture("0"), id: "budget-private", target: "project-private", redacted: true },
    ];
    render(<AdminMeteringView data={data} />);
    const usage = screen.getByRole("table", { name: "Usage detail" });
    const budgets = screen
      .getAllByRole("table")
      .find((table) => table.textContent?.includes("project-zeta"));
    assertDataHeadersSort(usage);
    assertDataHeadersSort(budgets as HTMLElement);
    const exceptions = screen.getByRole("table", { name: "Needs attention" });
    assertDataHeadersSort(exceptions);
    fireEvent.click(within(usage).getByRole("button", { name: "Sort Cost ascending" }));
    let rows = within(usage).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("conn_alpha");
    expect(rows.at(-1)).toHaveTextContent("conn_unknown");
    fireEvent.click(within(usage).getByRole("button", { name: "Sort Cost descending" }));
    rows = within(usage).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("conn_zeta");
    expect(rows.at(-1)).toHaveTextContent("conn_unknown");
    fireEvent.click(
      within(budgets as HTMLElement).getByRole("button", { name: "Sort Used ascending" }),
    );
    const budgetRows = within(budgets as HTMLElement)
      .getAllByRole("row")
      .slice(1);
    expect(budgetRows[0]).toHaveTextContent("project-alpha");
    expect(budgetRows.at(-1)).toHaveTextContent("project-private");
    expect(budgetRows.at(-1)).not.toHaveTextContent("0 Units");
  });

  it("sorts recovery data while selection and details remain actions", () => {
    const page = evidenceRecoveryFixture();
    const sample = page.rows[0];
    render(
      <RecoveryTable
        rows={[
          { ...sample, token: "zeta", provider: "zeta" },
          { ...sample, token: "alpha", provider: "alpha" },
        ]}
        selected={[]}
        busy={false}
        onSelect={vi.fn()}
        onDetails={vi.fn()}
      />,
    );
    const table = screen.getByTestId("admin-task-recovery");
    assertDataHeadersSort(table, ["Select", "Details"]);
    const provider = within(table)
      .getAllByRole("columnheader")
      .find((header) => header.textContent?.trim() === "Provider");
    fireEvent.click(within(provider as HTMLElement).getByRole("button", { name: /^Sort / }));
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("alpha");
    expect(within(table).getAllByRole("checkbox")).toHaveLength(2);
    expect(within(table).getAllByRole("button", { name: "Details" })).toHaveLength(2);
  });

  it("sorts all partial-evidence data columns", () => {
    const page = evidenceRecoveryFixture();
    render(<RecoveryPartialEvidence rows={page.partialEvidence ?? []} />);
    assertDataHeadersSort(screen.getByTestId("admin-partial-evidence"));
  });

  it("sorts children inside recovery groups while preserving each group and its actions", () => {
    const sample = evidenceRecoveryFixture().rows[0];
    render(
      <RecoveryTable
        rows={[
          { ...sample, token: "zeta", project: "prj_aaaaaaaaaaaaaaaaaaaaaaaa", provider: "zeta" },
          { ...sample, token: "other", project: "prj_bbbbbbbbbbbbbbbbbbbbbbbb", provider: "beta" },
          { ...sample, token: "alpha", project: "prj_aaaaaaaaaaaaaaaaaaaaaaaa", provider: "alpha" },
        ]}
        selected={[]}
        busy={false}
        onSelect={vi.fn()}
        onDetails={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Group this page" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "By project" }));
    const table = screen.getByTestId("admin-task-recovery");
    fireEvent.click(within(table).getByRole("button", { name: "Sort Provider ascending" }));
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent("prj_aaaaaaaaaaaaaaaaaaaaaaaa (2)");
    expect(rows[1]).toHaveTextContent("alpha");
    expect(rows[2]).toHaveTextContent("zeta");
    expect(rows[3]).toHaveTextContent("prj_bbbbbbbbbbbbbbbbbbbbbbbb (1)");
    expect(rows[4]).toHaveTextContent("beta");
    expect(within(table).getAllByRole("checkbox")).toHaveLength(3);
  });
});
