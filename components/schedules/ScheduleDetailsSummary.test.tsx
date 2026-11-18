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
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    summary();
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledWith(
      "/api/check-schedules/sch_example",
      expect.objectContaining({
        method: "PATCH",
      }),
    );
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
      projectId: "prj_example",
      enabled: false,
    });
  });
  it("explains a blocked next run instead of promising its planned date", () => {
    summary({ blocked: true });
    expect(screen.getByText("Next run blocked - monthly limit")).toBeVisible();
    expect(screen.queryByText(/spread across the interval/)).toBeNull();
  });
  it("offers archive without a default action or badge", () => {
    summary();
    expect(screen.queryByText("Default")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Actions for Weekly" }));
    expect(screen.queryByRole("menuitem", { name: "Make default" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Archive" })).toBeVisible();
  });
  it("keeps custom cron instants fixed and does not invent a monthly estimate", () => {
    summary({ frequency: "custom_cron", timeOfDay: null });
    expect(screen.queryByText(/spread across/)).toBeNull();
    expect(screen.getByText(/00:00/)).toBeVisible();
    expect(screen.getByText("Estimated per month").nextElementSibling).toHaveTextContent("-");
  });
  it("explains deletion for assigned keywords and offers archive", () => {
    summary({ keywordCount: 0, assignedKeywordCount: 1 });
    expect(
      screen.getByText(
        "Move or remove all keywords before deleting this schedule. You can also archive it.",
      ),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Actions for Weekly" }));
    expect(screen.queryByRole("menuitem", { name: /delete/i })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    expect(screen.getByRole("button", { name: "Move 1 keyword to" })).toBeVisible();
  });
  it("does not show the non-empty deletion message for an empty schedule", () => {
    summary({ keywordCount: 0, assignedKeywordCount: 0 });
    expect(screen.queryByText(/Move or remove all keywords before deleting/)).toBeNull();
  });
  it("omits lifecycle mutations for readers", () => {
    summary({}, false, false);
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Actions for Weekly" })).toBeNull();
  });
});
