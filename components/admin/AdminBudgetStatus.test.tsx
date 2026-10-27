import { renderWithInstanceAdminMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { MeteringAdminData } from "@/lib/metering/admin-types";
import { adminUsageFixture, budgetFixture } from "@/lib/metering/shared-view-fixtures";
import { screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AdminMeteringView } from "./AdminMeteringView";

vi.mock("@/lib/actions/metering-admin", () => ({ loadMeteringAdminPageAction: vi.fn() }));

it("explains a zero paid-attempt gate without claiming the budget was exceeded", () => {
  const data: MeteringAdminData = adminUsageFixture();
  const zero = { text: "0", unit: "paid_attempts", certainty: "measured" as const };
  data.budgets = [
    {
      ...budgetFixture("0"),
      unit: "paid_attempts",
      used: zero,
      reserved: zero,
      limit: zero,
      remaining: zero,
      level: "exceeded",
      boundary: { onExceed: "block" },
      resetsAt: null,
    },
  ];
  const view = render(<AdminMeteringView data={data} />);
  const table = screen.getByRole("table", { name: "Current budgets" });
  expect(within(table).queryByText("Over limit")).toBeNull();
  expect(within(table).getByText("Paid checks paused")).toBeVisible();
  expect(within(table).getByText("Historical costs need verification.")).toBeVisible();
  view.rerender(
    <AdminMeteringView
      data={{
        ...data,
        budgets: [
          {
            ...data.budgets[0],
            unit: "units",
            limit: { ...zero, unit: "units", text: "1" },
            used: { ...zero, unit: "units", text: "2" },
          },
        ],
      }}
    />,
  );
  expect(within(table).getByText("Over limit")).toBeVisible();
  expect(within(table).queryByText("Historical costs need verification.")).toBeNull();
});

it("renders a fallback public project ID as a single compact chip rather than wrapping text", () => {
  const data: MeteringAdminData = adminUsageFixture();
  const project = "prj_gbq2y4eno69j71rilfg0l1ub";
  const connection = "conn_pa8urxyzabcdefghij5fey9i";
  data.references = {
    projects: {},
    connections: { [connection]: { project, provider: "dataforseo" } },
  };
  data.usage.rows = data.usage.rows.map((row) => ({
    ...row,
    dimensions: { ...row.dimensions, connection },
  }));
  data.budgets = [{ ...budgetFixture(), target: connection, kind: "connection" }];
  render(<AdminMeteringView data={data} />);
  expect(screen.queryByText(project)).toBeNull();
  for (const chip of screen.getAllByTitle(project)) {
    expect(chip).toHaveTextContent("prj_gbq2y4…g0l1ub");
    expect(chip).toHaveClass("whitespace-nowrap");
    expect(within(chip).getByRole("button", { name: "Copy ID" })).toBeVisible();
  }
  expect(screen.getAllByTitle(project)).toHaveLength(2);
});
