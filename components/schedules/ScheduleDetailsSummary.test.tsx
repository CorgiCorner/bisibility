import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScheduleDetailsSummary } from "./ScheduleDetailsSummary";
import type { ScheduleListRow } from "./SchedulesList";

const schedule: ScheduleListRow = {
  publicId: "sch_example",
  name: "Weekly",
  frequency: "weekly",
  enabled: true,
  isDefault: false,
  keywordCount: 2,
  timeOfDay: null,
  timezone: "UTC",
  nextRunAt: "2026-10-26T00:00:00.000Z",
  nativeEstimate: { providerId: "serpapi", unit: "units", quantity: 2, unknownTargets: 0 },
};

afterEach(() => vi.unstubAllGlobals());
function summary(overrides: Partial<ScheduleListRow> = {}, canEdit = true, canManage = true) {
  return render(
    <ScheduleDetailsSummary
      canEdit={canEdit}
      canManage={canManage}
      projectId="prj_example"
      schedule={{ ...schedule, ...overrides }}
      schedules={[schedule]}
    />,
  );
}

describe("ScheduleDetailsSummary", () => {
  it("shows native per-run and monthly estimates without promising midnight for distributed checks", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    summary();
    expect(screen.getByText("From Mon, spread across the interval (UTC)")).toBeVisible();
    expect(screen.queryByText(/00:00/)).toBeNull();
    expect(screen.getByText("~2 operations")).toBeVisible();
    expect(screen.getByText("~8 operations")).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("uses the existing pause endpoint only after an explicit click", async () => {
    const fetch = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    summary();
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledWith(
      "/api/check-schedules/sch_example",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ projectId: "prj_example", enabled: false }),
      }),
    );
  });
  it("explains a blocked next run instead of promising its planned date", () => {
    summary({ blocked: true });
    expect(screen.getByText("Next run blocked - monthly limit")).toBeVisible();
    expect(screen.queryByText(/spread across the interval/)).toBeNull();
  });
  it("changes the default only after explicitly selecting the action", async () => {
    const fetch = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    summary();
    fireEvent.click(screen.getByRole("button", { name: "Actions for Weekly" }));
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("menuitem", { name: "Make default" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledWith(
      "/api/check-schedules/sch_example/set-default",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ projectId: "prj_example" }),
      }),
    );
  });
  it("keeps custom cron instants fixed and does not invent a monthly estimate", () => {
    summary({ frequency: "custom_cron", timeOfDay: null });
    expect(screen.queryByText(/spread across/)).toBeNull();
    expect(screen.getByText(/00:00/)).toBeVisible();
    expect(screen.getByText("Estimated per month").nextElementSibling).toHaveTextContent("-");
  });
  it("keeps the current default clear and offers no redundant Make default action", () => {
    summary({ isDefault: true });
    expect(screen.getByText("Default")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Actions for Weekly" }));
    expect(screen.queryByRole("menuitem", { name: "Make default" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Archive" })).toBeVisible();
  });
  it("omits lifecycle mutations for readers", () => {
    summary({}, false, false);
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Actions for Weekly" })).toBeNull();
  });
});
