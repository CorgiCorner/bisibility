import { renderWithInstanceAdminMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { MeteringAdminData } from "@/lib/metering/admin-types";
import { adminUsageFixture } from "@/lib/metering/shared-view-fixtures";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AdminMeteringView } from "./AdminMeteringView";

it("removes shadow and legacy comparison presentation", () => {
  render(<AdminMeteringView data={adminUsageFixture()} />);
  expect(screen.queryByText(/disagreement/i)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "First page" })).toBeNull();
});

const load = vi.hoisted(() => vi.fn());
beforeEach(() => {
  load.mockReset();
});
vi.mock("@/lib/actions/metering-admin", () => ({ loadMeteringAdminPageAction: load }));
it("retries a failed page with its original sealed cursor", async () => {
  const data = adminUsageFixture();
  data.usage.nextCursor = "failed-page-cursor";
  load.mockRejectedValueOnce(new Error("transport failed"));
  render(<AdminMeteringView data={data} month="2026-10" />);
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  const retry = await screen.findByRole("button", { name: "Try again" });
  await waitFor(() => expect(retry).toBeEnabled());
  load.mockResolvedValueOnce({ data });
  fireEvent.click(retry);
  await screen.findByRole("table", { name: "Usage detail" });
  expect(load).toHaveBeenCalledTimes(2);
  expect(load.mock.lastCall?.[0]).toMatchObject({ usageCursor: "failed-page-cursor" });
});
it("keeps both sealed cursor positions when either list advances or returns to first", async () => {
  const initial: MeteringAdminData = adminUsageFixture();
  initial.usage.nextCursor = "usage-2-sealed";
  initial.exceptions.nextCursor = "exceptions-2-sealed";
  load.mockImplementation(async () => ({ data: initial }));
  render(<AdminMeteringView data={initial} month="2026-10" project="p" />);
  // Paging stays disabled while a page loads, so each click waits for the previous load.
  const click = async (name: string, index: number) => {
    await waitFor(() => expect(screen.getAllByRole("button", { name })[index]).toBeEnabled());
    fireEvent.click(screen.getAllByRole("button", { name })[index]);
  };
  await click("Next page", 0);
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  await click("Next page", 1);
  await waitFor(() =>
    expect(load).toHaveBeenLastCalledWith({
      month: "2026-10",
      section: expect.any(String),
      project: "p",
      usageCursor: "usage-2-sealed",
      exceptionCursor: "exceptions-2-sealed",
    }),
  );
  await click("First page", 0);
  await waitFor(() =>
    expect(load).toHaveBeenLastCalledWith({
      month: "2026-10",
      section: expect.any(String),
      project: "p",
      usageCursor: undefined,
      exceptionCursor: "exceptions-2-sealed",
    }),
  );
  await click("Next page", 0);
  await click("First page", 1);
  await waitFor(() =>
    expect(load).toHaveBeenLastCalledWith({
      month: "2026-10",
      section: expect.any(String),
      project: "p",
      usageCursor: "usage-2-sealed",
      exceptionCursor: undefined,
    }),
  );
});

it("distinguishes an empty Store page from unavailable accounting", () => {
  const data: MeteringAdminData = adminUsageFixture();
  data.usage = { ...data.usage, state: "empty", rows: [] };
  const view = render(<AdminMeteringView data={data} />);
  expect(screen.getByText("No usage in this period.")).toBeInTheDocument();
  expect(screen.getByText("No exceptions in this period.")).toBeInTheDocument();
  view.rerender(<AdminMeteringView data={null} />);
  expect(screen.queryByText("No usage in this period.")).toBeNull();
  expect(screen.getByRole("status")).toHaveTextContent("unavailable");
});
it("shows each exception kind with localized state beside current budgets and historical usage", () => {
  const data: MeteringAdminData = adminUsageFixture();
  data.exceptions = {
    ...data.exceptions,
    state: "ok",
    rows: ["pending", "reservation_expired", "lease_expired"].map((kind, i) => ({
      operationId: `operation-${i}`,
      kind: kind as "pending" | "reservation_expired" | "lease_expired",
      state: "pending" as const,
      source: "app" as const,
      connection: "conn_example",
      since: "2026-09-01T00:00:00Z",
      estimate: [],
      provider: "dataforseo",
      operation: "rank_check",
      principal: "owner",
      ageSeconds: 120,
    })),
  };
  data.usage.asOf = "2026-09-30T23:59:59Z";
  render(<AdminMeteringView data={data} month="2026-09" />);
  for (const text of ["Pending evidence", "Reservation expired", "Lease expired", "100 Units"])
    expect(screen.getByText(text)).toBeInTheDocument();
  expect(screen.getByRole("table", { name: "Usage detail" })).toHaveTextContent("$0.12");
  expect(screen.getAllByText("Pending")).toHaveLength(3);
  expect(screen.getAllByText("Rank check")).toHaveLength(3);
});
it("keeps both tables busy while a page is pending and reports failed pages", async () => {
  const data: MeteringAdminData = adminUsageFixture();
  data.usage.nextCursor = "sealed-usage-next";
  let rejectPage: (reason: Error) => void = () => {};
  load.mockReturnValue(
    new Promise((_resolve, reject) => {
      rejectPage = reject;
    }),
  );
  render(<AdminMeteringView data={data} month="2026-10" />);
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  for (const table of screen.getAllByRole("table"))
    expect(table).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  await act(async () => rejectPage(new Error("page failed")));
  expect(screen.getByRole("status")).toHaveTextContent("unavailable");
  expect(screen.getByRole("table", { name: "Usage detail" })).toBeInTheDocument();
  expect(screen.getByRole("table", { name: "Current budgets" })).toBeInTheDocument();
  expect(screen.queryByText("page failed")).toBeNull();
});

it("renders compact budget rows with readable scope and exact unknown semantics", () => {
  const data: MeteringAdminData = adminUsageFixture();
  const row = data.budgets[0];
  if (!row) throw new Error("Missing budget fixture");
  row.target = "prj_example_long_public_id";
  data.references = { projects: { [row.target]: "Example project" }, connections: {} };
  data.budgets = [
    row,
    { ...row, id: "unknown", level: "unavailable", used: "unavailable", remaining: "unavailable" },
  ];
  render(<AdminMeteringView data={data} />);
  const table = screen.getByRole("table", { name: "Current budgets" });
  expect(within(table).getAllByText("Example project")).toHaveLength(2);
  expect(within(table).getByText("62 Units")).toBeInTheDocument();
  expect(within(table).getAllByText("Unavailable").length).toBeGreaterThan(0);
  expect(within(table).getAllByRole("button", { name: "Copy ID" })).toHaveLength(2);
  expect(within(table).getAllByRole("row")).toHaveLength(3);
});

it("names currency columns even when amount suffix formatting omits the currency unit", () => {
  render(<AdminMeteringView data={adminUsageFixture()} />);
  const table = screen.getByRole("table", { name: "Usage detail" });
  expect(
    within(table)
      .getAllByRole("columnheader")
      .every((cell) => cell.textContent?.trim()),
  ).toBe(true);
  expect(within(table).getByRole("columnheader", { name: "Customer charges" })).toBeInTheDocument();
});

it("preserves a hard spending ceiling and conceals every redacted amount", () => {
  const data: MeteringAdminData = adminUsageFixture();
  const seed = data.budgets[0];
  if (!seed) throw new Error("Missing budget fixture");
  data.budgets = [
    {
      ...seed,
      boundary: {
        onExceed: "allow",
        hardLimit: { text: "120", unit: "units", certainty: "measured" },
      },
    },
  ];
  const view = render(<AdminMeteringView data={data} />);
  expect(screen.getByText("Hard limit:", { exact: false })).toHaveTextContent("120 Units");
  view.rerender(
    <AdminMeteringView
      data={{ ...data, budgets: [{ ...(data.budgets[0] as typeof seed), redacted: true }] }}
    />,
  );
  const table = screen.getByRole("table", { name: "Current budgets" });
  expect(within(table).queryByText(/120 Units|62 Units|38 Units|100 Units/)).toBeNull();
  expect(within(table).getByText(/figures are hidden/)).toBeInTheDocument();
});

it("isolates unavailable budgets from confirmed usage and exception data", () => {
  const data = { ...adminUsageFixture(), budgetsUnavailable: true };
  render(<AdminMeteringView data={data} />);
  expect(screen.getByRole("table", { name: "Usage detail" })).toBeInTheDocument();
  expect(screen.getByText("No exceptions in this period.")).toBeInTheDocument();
  expect(screen.queryByRole("table", { name: "Current budgets" })).toBeNull();
  expect(screen.getByRole("status")).toHaveTextContent("unavailable");
});

it.each([
  ["usage", "unavailable"],
  ["usage", "forbidden"],
  ["exceptions", "unavailable"],
  ["exceptions", "forbidden"],
] as const)(
  "keeps the %s rows and cursor after a typed %s page, then retries",
  async (kind, state) => {
    const initial: MeteringAdminData = adminUsageFixture();
    initial.usage.nextCursor = "sealed-usage-next";
    initial.exceptions = {
      ...initial.exceptions,
      state: "ok",
      nextCursor: "sealed-exceptions-next",
      rows: [
        {
          operationId: "original-operation",
          kind: "pending",
          state: "pending",
          source: "app",
          connection: "conn_example",
          since: "2026-10-01T00:00:00Z",
          estimate: [],
          provider: "dataforseo",
          operation: "rank_check",
          principal: "owner",
          ageSeconds: 120,
        },
      ],
    };
    load.mockResolvedValueOnce({
      data: { ...initial, [kind]: { ...initial[kind], state, rows: [], nextCursor: null } },
    });
    render(<AdminMeteringView data={initial} month="2026-10" />);
    fireEvent.click(screen.getAllByRole("button", { name: "Next page" })[kind === "usage" ? 0 : 1]);
    const retry = await screen.findByRole("button", { name: "Try again" });
    await waitFor(() => expect(retry).toBeEnabled());
    expect(screen.getByRole("table", { name: "Usage detail" })).toHaveTextContent("$0.12");
    expect(screen.getByText("Pending evidence")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "First page" })).toBeNull();
    load.mockResolvedValueOnce({ data: initial });
    fireEvent.click(retry);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Try again" })).toBeNull());
    expect(load).toHaveBeenLastCalledWith(
      expect.objectContaining({
        section: kind,
        [kind === "usage" ? "usageCursor" : "exceptionCursor"]: `sealed-${kind}-next`,
      }),
    );
  },
);
