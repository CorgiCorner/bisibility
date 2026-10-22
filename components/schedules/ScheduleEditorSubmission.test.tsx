import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { updateCheckScheduleSchema } from "@/lib/schemas/check-schedule";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScheduleEditor } from "./ScheduleEditor";
import { type ScheduleEditorSchedule, scheduleEditorDefaults } from "./ScheduleEditorModel";

const schedule = {
  cronExpression: null,
  enabled: true,
  frequency: "daily" as const,
  isDefault: false,
  jitterMinutes: 15,
  keywordCount: 2,
  name: "Commercial daily",
  providerPolicy: null,
  publicId: "sch_story",
  serpDepth: null,
  timeOfDay: "06:00",
  timezone: null,
};

const connectedProviders = [{ label: "SerpApi", value: "serpapi" }];
const projectDefaults = { provider: connectedProviders[0], serpDepth: 20 } as const;

function renderEditor(value: ScheduleEditorSchedule = schedule) {
  return render(
    <ScheduleEditor
      connectedProviders={connectedProviders}
      defaultScheduleName="Daily 06:00"
      projectId="prj_story"
      projectDefaults={projectDefaults}
      projectTimezone="Europe/Madrid"
      schedule={value}
    />,
  );
}

function mockScheduleUpdate() {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: { publicId: "sch_story" } })));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function savedPayload(fetchMock: ReturnType<typeof mockScheduleUpdate>) {
  return JSON.parse(fetchMock.mock.calls[0][1].body);
}

describe("ScheduleEditor submission", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retains visible save confirmation until the next unsaved edit", async () => {
    const user = userEvent.setup();
    mockScheduleUpdate();
    renderEditor();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Saved daily" } });
    await user.click(screen.getByRole("button", { name: "Save schedule" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Schedule saved.");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Unsaved next edit" } });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("keeps a restored schedule nondefault when the project has no default", async () => {
    const fetchMock = mockScheduleUpdate();
    render(
      <ScheduleEditor
        connectedProviders={connectedProviders}
        defaultScheduleName={null}
        projectId="prj_story"
        projectDefaults={projectDefaults}
        projectTimezone="Europe/Warsaw"
        schedule={{ ...schedule, enabled: false }}
      />,
    );
    expect(screen.getByRole("switch", { name: /^Use as default suggestion/ })).not.toBeChecked();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Restored daily" } });
    fireEvent.click(screen.getByRole("button", { name: "Save schedule" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/check-schedules/sch_story", expect.any(Object));
  });

  it("updates the automatic name through cadence changes and saves it", async () => {
    const user = userEvent.setup();
    const fetchMock = mockScheduleUpdate();
    renderEditor({ ...schedule, name: "Daily 06:00" });
    await user.click(screen.getByRole("radio", { name: "Weekly" }));
    await user.click(screen.getByRole("button", { name: "Day of week" }));
    await user.click(screen.getByRole("menuitem", { name: "Friday" }));
    fireEvent.change(screen.getByLabelText("Time, 24-hour"), { target: { value: "08:00" } });
    expect(screen.getByLabelText("Name")).toHaveValue("Weekly · Fri 08:00");
    await user.click(screen.getByRole("button", { name: "Save schedule" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(savedPayload(fetchMock)).toMatchObject({ name: "Weekly · Fri 08:00", serpDepth: null });
  });

  it.each(["weekly", "monthly"])(
    "can rename and restore a %s schedule without changing its cadence",
    async (frequency) => {
      const user = userEvent.setup();
      const fetchMock = mockScheduleUpdate();
      const projectId = `prj_${"a".repeat(24)}`;
      const scheduleId = `sch_${"b".repeat(24)}`;
      render(
        <ScheduleEditor
          connectedProviders={connectedProviders}
          projectDefaults={projectDefaults}
          projectId={projectId}
          projectTimezone="UTC"
          schedule={{
            ...schedule,
            frequency,
            publicId: scheduleId,
            name: "Daily",
            timeOfDay: null,
          }}
        />,
      );
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Weekly" } });
      await user.click(screen.getByRole("button", { name: "Save schedule" }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const input = savedPayload(fetchMock);
      expect(updateCheckScheduleSchema.safeParse({ ...input, scheduleId }).success).toBe(true);
      expect(input).toMatchObject({
        name: "Weekly",
        frequency,
        timeOfDay: null,
        cronExpression: null,
      });
      expect(screen.getByLabelText("Name")).toHaveAccessibleDescription(
        "Name only. Change Frequency below to change when checks run.",
      );
    },
  );

  it.each([
    [401, "Your session expired. Sign in again, then retry saving."],
    [403, "You no longer have permission to edit this schedule."],
    [404, "This schedule is no longer available. Return to the schedule list."],
    [409, "The schedule changed. Reload it before saving again."],
    [423, "This project is read-only. You can save after editing is restored."],
    [400, "Check the schedule settings before saving again."],
    [500, "Could not save. Your changes are still here. Try again."],
  ])(
    "preserves edits and explains HTTP %s without leaking server details",
    async (status, message) => {
      const user = userEvent.setup();
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ detail: "unexpected server details" }), { status }),
        );
      vi.stubGlobal("fetch", fetchMock);
      renderEditor();
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Weekly" } });
      await user.click(screen.getByRole("button", { name: "Save schedule" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(screen.queryByRole("status")).toBeNull();
      expect(screen.getByLabelText("Name")).toHaveValue("Weekly");
      expect(screen.queryByText("unexpected server details")).not.toBeInTheDocument();
    },
  );

  it("retries only on request and keeps the edited name after a failed save", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { publicId: "sch_story" } })));
    vi.stubGlobal("fetch", fetchMock);
    renderEditor();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Weekly" } });
    await user.click(screen.getByRole("button", { name: "Save schedule" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your changes are still here.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Save schedule" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).name).toBe("Weekly");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("preserves a custom name when frequency or time changes", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("radio", { name: "Weekly" }));
    fireEvent.change(screen.getByLabelText("Time, 24-hour"), { target: { value: "08:00" } });
    expect(screen.getByLabelText("Name")).toHaveValue("Commercial daily");
  });

  it("saves project-default provider and depth values as follow-default", async () => {
    const user = userEvent.setup();
    const fetchMock = mockScheduleUpdate();
    renderEditor({ ...schedule, providerPolicy: "serpapi", serpDepth: 20 });

    await user.click(screen.getByRole("button", { name: "Provider" }));
    await user.click(screen.getByRole("menuitem", { name: "Project default (SerpApi)" }));
    await user.click(screen.getByRole("button", { name: "Depth" }));
    await user.click(screen.getByRole("menuitem", { name: "Project default (Top 20)" }));
    await user.click(screen.getByRole("button", { name: "Save schedule" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(savedPayload(fetchMock)).toMatchObject({ providerPolicy: null, serpDepth: null });
  });

  it("saves pinned provider and depth values", async () => {
    const user = userEvent.setup();
    const fetchMock = mockScheduleUpdate();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Provider" }));
    await user.click(screen.getByRole("menuitem", { name: "Always SerpApi" }));
    await user.click(screen.getByRole("button", { name: "Depth" }));
    await user.click(screen.getByRole("menuitem", { name: "Always Top 20" }));
    await user.click(screen.getByRole("button", { name: "Save schedule" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(savedPayload(fetchMock)).toMatchObject({ providerPolicy: "serpapi", serpDepth: 20 });
  });

  it("persists a weekly Friday cadence and restores Friday on reload", async () => {
    const user = userEvent.setup();
    const fetchMock = mockScheduleUpdate();
    renderEditor();

    await user.click(screen.getByRole("radio", { name: "Weekly" }));
    await user.click(screen.getByRole("button", { name: "Day of week" }));
    await user.click(screen.getByRole("menuitem", { name: "Friday" }));
    await user.click(screen.getByRole("button", { name: "Save schedule" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(savedPayload(fetchMock)).toMatchObject({
      cronExpression: "0 6 * * 5",
      frequency: "weekly",
    });
    expect(
      scheduleEditorDefaults({ ...schedule, cronExpression: "0 6 * * 5", frequency: "weekly" }),
    ).toMatchObject({ weekday: "Friday" });
  });

  it("persists a monthly 15th cadence and restores the 15th on reload", async () => {
    const user = userEvent.setup();
    const fetchMock = mockScheduleUpdate();
    renderEditor();

    await user.click(screen.getByRole("radio", { name: "Monthly" }));
    await user.click(screen.getByRole("button", { name: "Day of month" }));
    await user.click(screen.getByRole("menuitem", { name: "15th" }));
    await user.click(screen.getByRole("button", { name: "Save schedule" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(savedPayload(fetchMock)).toMatchObject({
      cronExpression: "0 6 15 * *",
      frequency: "monthly",
    });
    expect(
      scheduleEditorDefaults({ ...schedule, cronExpression: "0 6 15 * *", frequency: "monthly" }),
    ).toMatchObject({ dayOfMonth: "15th" });
  });
});

it.each([
  { field: "Name", value: "", error: "Enter a schedule name." },
  { field: "Name", value: "x".repeat(81), error: "Schedule names are 80 characters or fewer." },
  {
    field: "Cron expression",
    value: "invalid",
    error: "Enter a valid five-field cron expression.",
  },
])("blocks invalid $field and reveals its validation error", async ({ field, value, error }) => {
  const user = userEvent.setup();
  const fetchMock = mockScheduleUpdate();
  renderEditor();
  if (field === "Cron expression")
    await user.click(screen.getByRole("radio", { name: "Custom cron" }));
  const input = screen.getByLabelText(field);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  fireEvent.change(input, { target: { value } });
  await user.click(screen.getByRole("button", { name: "Save schedule" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(error);
  expect(input.parentElement).toContainElement(screen.getByRole("alert"));
  expect(fetchMock).not.toHaveBeenCalled();
});
