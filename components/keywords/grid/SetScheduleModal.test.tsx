import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { ToastProvider } from "@/components/ui";
import type { KeywordRow } from "@/lib/queries/keywords";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SetScheduleModal } from "./SetScheduleModal";
import type { CheckScheduleSummary } from "./set-schedule-model";

const projectId = "prj_schedule_modal";
const rows = [keywordRows[0] as KeywordRow];
const schedules = [
  {
    cronExpression: "0 6 * * *",
    enabled: true,
    frequency: "daily",
    isDefault: true,
    jitterMinutes: 60,
    keywordCount: 16,
    name: "Daily 06:00",
    publicId: "sch_daily",
    serpDepth: null,
    timeOfDay: "06:00",
    timezone: "UTC",
  },
  {
    cronExpression: "0 6 * * 1",
    enabled: true,
    frequency: "weekly",
    isDefault: false,
    jitterMinutes: 60,
    keywordCount: 8,
    name: "Weekly Mon",
    publicId: "sch_weekly",
    serpDepth: null,
    timeOfDay: "06:00",
    timezone: "UTC",
  },
] satisfies CheckScheduleSummary[];

function renderModal(overrides: Partial<React.ComponentProps<typeof SetScheduleModal>> = {}) {
  return render(
    <ToastProvider>
      <SetScheduleModal
        currentScheduleId="sch_daily"
        onClose={vi.fn()}
        onDone={vi.fn()}
        open
        projectId={projectId}
        providerRate={{ overrideCents: 1, providerId: "dataforseo" }}
        schedules={schedules}
        selectedRows={rows}
        {...overrides}
      />
    </ToastProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("SetScheduleModal", () => {
  it("radiogroup", () => {
    renderModal();
    expect(screen.getByRole("radiogroup", { name: "Schedule" })).toBeInTheDocument();
  });

  it("CURRENT disabled", () => {
    renderModal();
    expect(screen.getAllByRole("radio")[0]).toBeDisabled();
    expect(screen.getByText("Current")).toBeInTheDocument();
  });

  it("monthly delta", () => {
    renderModal();
    expect(screen.getAllByText(/[+-]\$.*\/ month/).length).toBeGreaterThan(0);
  });

  it('"Next:" per option', () => {
    renderModal();
    expect(screen.getAllByText(/^Next:/)).toHaveLength(schedules.length);
    expect(screen.getByText("Next: Daily, 06:00")).toBeInTheDocument();
    expect(screen.getByText("Next: Mondays, 06:00")).toBeInTheDocument();
  });

  it("shows schedule skeleton rows and disables Save while schedules load", () => {
    renderModal({
      currentScheduleId: null,
      initialChoice: "sch_weekly",
      scheduleLoadState: "loading",
    });

    expect(screen.getAllByTestId("schedule-choice-skeleton")).toHaveLength(2);
    expect(screen.queryByText("Daily 06:00")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move 1 target" })).toBeDisabled();
  });

  it("keeps the static choices usable when schedules fail to load", () => {
    renderModal({
      initialChoice: "remove",
      scheduleLoadError: "Could not load schedules. Try again.",
      scheduleLoadState: "error",
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Could not load schedules. Try again.");
    expect(screen.getByRole("button", { name: /^New schedule/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Remove 1 target from schedule" })).toBeEnabled();
  });

  it('"Remove from schedule" under a divider', () => {
    renderModal();
    const remove = screen.getByRole("radio", { name: /Remove from schedule/ });
    expect(remove.closest("label")?.previousElementSibling).toHaveClass("bg-border");
  });

  it("CTA from choice", () => {
    renderModal();
    fireEvent.click(screen.getByRole("radio", { name: /Weekly Mon/ }));
    expect(screen.getByRole("button", { name: "Move 1 target" })).toBeEnabled();
    fireEvent.click(screen.getByRole("radio", { name: /Remove from schedule/ }));
    expect(screen.getByRole("button", { name: "Remove 1 target from schedule" })).toBeEnabled();
  });

  it("title counts keywords and targets", () => {
    renderModal();
    expect(
      screen.getByRole("heading", { name: "Set schedule for 1 keyword / 1 target" }),
    ).toBeInTheDocument();
  });

  it("one right edge", () => {
    renderModal();
    expect(screen.getAllByRole("radio")[1]?.closest("label")).toHaveClass(
      "grid-cols-[15px_minmax(0,1fr)_minmax(0,1fr)]",
    );
  });

  it("2-line rows", () => {
    renderModal();
    expect(screen.getByText("All 1 target move from Daily 06:00.")).toBeInTheDocument();
    expect(screen.getByText("Next: Mondays, 06:00")).toBeInTheDocument();
  });

  it("uses target grammar and a removal savings label", () => {
    renderModal({ selectedRows: [...rows, { ...rows[0], id: "kw_2" }] });

    expect(screen.getByText("New cadence for these 2 targets.")).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /Remove from schedule/ }).closest("label"),
    ).toHaveTextContent(/-\$.*\/ month/);
  });

  it("uses singular target grammar for a new schedule", () => {
    renderModal();

    expect(screen.getByText("New cadence for this target.")).toBeInTheDocument();
  });

  it("Manage schedules muted in footer", () => {
    renderModal();
    expect(screen.getByRole("link", { name: "Manage schedules" })).toHaveClass("text-fg-muted");
  });

  it("calls the schedule create and assignment routes from the new-schedule form", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => ({ data: { publicId: "sch_new" } }), ok: true })
      .mockResolvedValueOnce({ json: async () => ({ data: { updated: 1 } }), ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const onDone = vi.fn();
    renderModal({ initialView: "new", onDone });

    fireEvent.click(screen.getByRole("button", { name: "Create schedule" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/check-schedules");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/check-schedules/sch_new/keywords");
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });
});
