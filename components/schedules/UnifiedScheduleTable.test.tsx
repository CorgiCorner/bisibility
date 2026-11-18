import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { aiFixture, rankFixture } from "@/lib/schedules/list.test-fixture";
import { readOnlyScheduleFixtures } from "@/lib/schedules/read-only.test-fixture";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { toAiScheduleListRow } from "./ai-schedule-rows";
import { SchedulesList } from "./SchedulesList";
import { SchedulesWorkspace } from "./SchedulesWorkspace";

const setSyncState = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions/data-sync-schedule", () => ({
  setDataSyncScheduleState: setSyncState,
}));
vi.mock("@/lib/actions/ai-tracking", () => ({ mutateAiTrackingAction: vi.fn() }));
vi.mock("@/components/ai-tracking/AiScheduleDrawerHost", () => ({
  AiScheduleDrawerHost: () => null,
}));

const allSyncs = ["domain_rating", "sitemap", "search_console", "page_indexing"] as const;

function show(
  unifiedSchedules = readOnlyScheduleFixtures,
  canUpdate = false,
  canUpdateSyncs: readonly (typeof allSyncs)[number][] = canUpdate ? allSyncs : [],
) {
  return render(
    <SchedulesWorkspace
      ai={null}
      aiTarget={null}
      canManage={false}
      canUpdate={canUpdate}
      canUpdateSyncs={canUpdateSyncs}
      projectId="prj_one"
      projectRef="prj_one"
      schedules={[]}
      unifiedSchedules={unifiedSchedules}
      status="current"
    />,
  );
}
it("renders one catalog in checks and data sync groups with one server-derived total", () => {
  show();
  const checks = screen.getByRole("table", { name: "Checks" });
  expect(within(checks).getByText("Local checks")).toBeVisible();
  expect(within(checks).getByText("Approval expired")).toBeVisible();
  const syncs = screen.getByRole("table", { name: "Data sync" });
  for (const name of ["Domain rating", "Sitemap sync", "Search Console import", "Page indexing"])
    expect(within(syncs).getByText(name)).toBeVisible();
  expect(within(syncs).getAllByText("Active")).toHaveLength(4);
  expect(within(syncs).getAllByText("Oct 20, 2026, 12:00 PM")).toHaveLength(4);
  expect(within(syncs).getByRole("columnheader", { name: "Last recorded run" })).toBeVisible();
  expect(screen.getByText("Estimated monthly cost: $2.00")).toBeVisible();
  const switches = within(syncs).getAllByRole("switch");
  expect(switches).toHaveLength(4);
  for (const control of switches) {
    expect(control).toBeChecked();
    expect(control).toBeDisabled();
  }
  expect(syncs.querySelector('[role="row"][tabindex="0"]')).toBeNull();
  expect(within(syncs).queryByRole("button")).toBeNull();
  expect(within(checks).queryByRole("button")).toBeNull();
});
it("resumes a paused data sync for a writer", async () => {
  setSyncState.mockResolvedValueOnce({ ok: true });
  show(
    readOnlyScheduleFixtures.map((row) =>
      row.kind === "data_sync" && row.sync_kind === "page_indexing"
        ? { ...row, state: "paused" }
        : row,
    ),
    true,
  );
  const toggle = screen.getByRole("switch", { name: "Page indexing" });
  expect(toggle).toBeEnabled();
  expect(toggle).not.toBeChecked();
  fireEvent.click(toggle);
  await waitFor(() => expect(routerMock.refresh).toHaveBeenCalled());
  expect(setSyncState).toHaveBeenLastCalledWith({
    enabled: true,
    projectId: "prj_one",
    syncKind: "page_indexing",
  });
});

it("disables the Page indexing switch while background inspection is off", () => {
  show(
    readOnlyScheduleFixtures.map((row) =>
      row.kind === "data_sync" && row.sync_kind === "page_indexing"
        ? { ...row, state: "paused", state_reason: "inspection_budget_off" }
        : row,
    ),
    true,
  );
  const toggle = screen.getByRole("switch", { name: "Page indexing" });
  expect(toggle).toBeDisabled();
  expect(toggle).not.toBeChecked();
  expect(screen.getByText("Background inspection is off")).toBeVisible();
  expect(screen.getByRole("link", { name: "URL inspection settings" })).toHaveAttribute(
    "href",
    "/app/prj_one/settings/data-sources#url-inspection",
  );
  expect(screen.getByRole("switch", { name: "Sitemap sync" })).toBeEnabled();
  const calls = setSyncState.mock.calls.length;
  fireEvent.click(toggle);
  expect(setSyncState).toHaveBeenCalledTimes(calls);
});

it("keeps the Domain Rating switch disabled for a member without provider admin", () => {
  // A member may update schedules, sitemap, Search Console and the inspection budget, but not
  // the provider connection that Domain Rating spends requests on.
  show(readOnlyScheduleFixtures, true, ["sitemap", "search_console", "page_indexing"]);
  expect(screen.getByRole("switch", { name: "Domain rating" })).toBeDisabled();
  for (const name of ["Sitemap sync", "Search Console import", "Page indexing"])
    expect(screen.getByRole("switch", { name })).toBeEnabled();
});

it("shows a save error and restores the previous switch state", async () => {
  setSyncState.mockRejectedValueOnce(new Error("Forbidden"));
  show(readOnlyScheduleFixtures, true);
  const toggle = screen.getByRole("switch", { name: "Sitemap sync" });
  fireEvent.click(toggle);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not save the sync schedule.");
  await waitFor(() => expect(toggle).toBeEnabled());
  expect(toggle).toBeChecked();
});

it("keeps unknown paid estimates visible without counting free syncs as unknown", () => {
  show(readOnlyScheduleFixtures.map((row) => ({ ...row, monthly_cost_estimate_cents: null })));
  expect(screen.getByText("Estimated monthly cost: $0.00 · 1 estimate unavailable")).toBeVisible();
});
it("keeps the read-only rows out of the keyboard action order", () => {
  show();
  for (const label of ["Checks", "Data sync"]) {
    const table = screen.getByRole("table", { name: label });
    expect(table.querySelector('[role="row"][tabindex="0"]')).toBeNull();
    expect(within(table).queryByRole("button")).toBeNull();
  }
});

it("uses each sync's own cadence and the shared human cadence labels", () => {
  show();
  const syncs = screen.getByRole("table", { name: "Data sync" });
  for (const [name, cadence] of [
    ["Domain rating", "Hourly, :00"],
    ["Sitemap sync", "Daily, 04:45"],
    ["Search Console import", "Daily, 12:40"],
    ["Page indexing", "Daily, 03:45"],
  ])
    expect(
      within(within(syncs).getByRole("row", { name: new RegExp(name) })).getByText(cadence),
    ).toBeVisible();
  expect(
    within(screen.getByRole("table", { name: "Checks" })).getByText("Daily, 04:45"),
  ).toBeVisible();
});

it("shares column geometry and resizing without a trailing divider or action placeholder", () => {
  show();
  const checks = screen.getByRole("table", { name: "Checks" });
  const syncs = screen.getByRole("table", { name: "Data sync" });
  const checkHeaders = within(checks).getAllByRole("columnheader");
  const syncHeaders = within(syncs).getAllByRole("columnheader");
  expect(syncHeaders).toHaveLength(checkHeaders.length);
  expect(syncHeaders.map((cell) => cell.getAttribute("style"))).toEqual(
    checkHeaders.map((cell) => cell.getAttribute("style")),
  );
  expect(
    within(within(syncs).getByRole("columnheader", { name: "Actions" })).queryByRole("separator"),
  ).toBeNull();
  const local = within(checks).getByRole("row", { name: /Local checks/ });
  expect(within(local).getAllByRole("cell").at(-1)?.textContent).toBe("");
  const checkResize = within(checks).getByRole("separator", { name: "Resize Cadence column" });
  fireEvent.keyDown(checkResize, { key: "ArrowRight" });
  expect(within(syncs).getByRole("separator", { name: "Resize Cadence column" })).toHaveAttribute(
    "aria-valuenow",
    checkResize.getAttribute("aria-valuenow"),
  );
});

it.each([
  ["weekly", "0 9 * * 1", "09:00", "Monday, 09:00"],
  ["monthly", "0 6 1 * *", "06:00", "Monthly on the 1st, 06:00"],
  ["custom_cron", "*/15 4-6 * * 1-5", null, "Custom - */15 4-6 * * 1-5"],
] as const)(
  "formats a read-only %s cadence with the existing check formatter",
  (frequency, cron, time, label) => {
    show([
      {
        ...readOnlyScheduleFixtures[0],
        cadence: {
          frequency,
          cron_expression: cron,
          time_of_day: time,
          timezone: "UTC",
        },
      },
    ]);
    expect(screen.getByText(label)).toBeVisible();
  },
);

it.each(["Enter", " "])("opens check editors with %s while keeping added rows inert", (key) => {
  vi.clearAllMocks();
  render(
    <SchedulesList
      canManage
      canUpdate
      projectId="prj_one"
      projectRef="prj_one"
      schedules={[rankFixture]}
      readOnlySchedules={readOnlyScheduleFixtures}
      ai={{
        canWrite: true,
        activePromptCount: 2,
        rows: [toAiScheduleListRow(aiFixture)],
        onArchive: vi.fn(),
        onPause: vi.fn(),
      }}
    />,
  );
  for (const [name, href] of [
    [rankFixture.name, "/app/prj_one/schedules/sch_daily"],
    [aiFixture.name, "/app/prj_one/schedules?ai=ais_weekly"],
  ]) {
    const row = screen.getByRole("row", { name: new RegExp(name) });
    expect(row).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(row, { key });
    expect(routerMock.push).toHaveBeenLastCalledWith(href);
  }
  routerMock.push.mockClear();
  for (const name of ["Local checks", "Sitemap sync"]) {
    const row = screen.getByRole("row", { name: new RegExp(name) });
    expect(row).not.toHaveAttribute("tabindex", "0");
    fireEvent.click(row);
    fireEvent.keyDown(row, { key });
  }
  expect(routerMock.push).not.toHaveBeenCalled();
});
