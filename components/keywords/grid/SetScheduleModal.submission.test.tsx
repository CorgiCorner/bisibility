import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { ToastProvider } from "@/components/ui/Toast";
import type { KeywordRow } from "@/lib/queries/keywords";
import {
  checkScheduleMembershipSchema,
  createCheckScheduleSchema,
} from "@/lib/schemas/check-schedule";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SetScheduleModal } from "./SetScheduleModal";

const projectId = "prj_a00000000000000000000000";
const scheduleId = "sch_a00000000000000000000000";
const keywordId = "kw_a00000000000000000000000";

function setup() {
  const onDone = vi.fn();
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const parsed =
      url === "/api/check-schedules"
        ? createCheckScheduleSchema.safeParse(body)
        : checkScheduleMembershipSchema.safeParse({ ...body, scheduleId });
    return new Response(
      JSON.stringify(
        parsed.success
          ? { data: url === "/api/check-schedules" ? { publicId: scheduleId } : { updated: 1 } }
          : { detail: "Request validation failed.", errors: parsed.error.flatten() },
      ),
      { status: parsed.success ? 200 : 400 },
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  render(
    <ToastProvider>
      <SetScheduleModal
        initialView="new"
        onClose={vi.fn()}
        onDone={onDone}
        open
        projectId={projectId}
        schedules={[]}
        selectedRows={[{ ...keywordRows[0], id: keywordId } as KeywordRow]}
      />
    </ToastProvider>,
  );
  return { fetchMock, onDone };
}

afterEach(() => vi.unstubAllGlobals());

describe("new schedule API contract", () => {
  it.each([
    ["Daily", "daily", null],
    ["Weekly", "weekly", "0 6 * * 1"],
    ["Monthly", "monthly", "0 6 1 * *"],
    ["Custom cron", "custom_cron", "0 6 * * *"],
  ])(
    "creates and assigns a %s schedule accepted by the API",
    async (label, frequency, cronExpression) => {
      const { fetchMock, onDone } = setup();
      fireEvent.click(screen.getByRole("radio", { name: label }));
      fireEvent.click(screen.getByRole("button", { name: "Create schedule" }));
      await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
      expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({
        cronExpression,
        frequency,
        jitterMinutes: 15,
        timezone: null,
        timeOfDay: frequency === "custom_cron" ? null : "06:00",
      });
      expect(fetchMock.mock.calls[1][0]).toBe(`/api/check-schedules/${scheduleId}/keywords`);
      expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toEqual({
        projectId,
        keywordIds: [keywordId],
      });
    },
  );

  it.each([
    ["Weekly", "Day", "Friday", "0 18 * * 5"],
    ["Monthly", "Day of month", "15th", "0 18 15 * *"],
  ])("saves the selected day and time for %s", async (frequency, field, day, cronExpression) => {
    const user = userEvent.setup();
    const { fetchMock, onDone } = setup();
    await user.click(screen.getByRole("radio", { name: frequency }));
    await user.click(screen.getByRole("button", { name: field }));
    await user.click(screen.getByRole("menuitem", { name: day }));
    await user.click(screen.getByRole("button", { name: "Time" }));
    await user.click(screen.getByRole("menuitem", { name: "18:00" }));
    await user.click(screen.getByRole("button", { name: "Create schedule" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({
      cronExpression,
      timeOfDay: "18:00",
    });
  });

  it("shows an invalid cron error before making a request", async () => {
    const user = userEvent.setup();
    const { fetchMock } = setup();
    await user.click(screen.getByRole("radio", { name: "Custom cron" }));
    await user.clear(screen.getByRole("textbox", { name: "Cron" }));
    await user.type(screen.getByRole("textbox", { name: "Cron" }), "invalid");
    await user.click(screen.getByRole("button", { name: "Create schedule" }));
    expect(await screen.findByText("Enter a valid five-field cron expression.")).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
