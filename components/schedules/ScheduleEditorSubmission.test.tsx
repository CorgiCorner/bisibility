import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScheduleEditor } from "./ScheduleEditor";
import { scheduleEditorDefaults } from "./ScheduleEditorModel";

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

function renderEditor(value = schedule) {
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
    expect(
      screen.getByRole("switch", { name: /^Use as default for new keywords/ }),
    ).not.toBeChecked();
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
    renderEditor();

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
