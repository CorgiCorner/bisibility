import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import { routerMock } from "@/tests/next-navigation";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleEditor } from "./ScheduleEditor";
import { type ScheduleEditorProjectDefaults, scheduleEditorSchema } from "./ScheduleEditorModel";

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
const projectDefaults: ScheduleEditorProjectDefaults = {
  provider: connectedProviders[0],
  serpDepth: 20,
};

function renderEditor(
  defaults = projectDefaults,
  overrides: Partial<ComponentProps<typeof ScheduleEditor>> = {},
) {
  return render(
    <ScheduleEditor
      connectedProviders={connectedProviders}
      defaultScheduleName="Daily 06:00"
      members={[{ name: "headless cms", publicId: "kw_saved", targetCount: 2 }]}
      projectId="prj_story"
      projectDefaults={defaults}
      projectTimezone="Europe/Madrid"
      referenceIso="2026-09-03T10:00:00.000Z"
      schedule={schedule}
      {...overrides}
    />,
  );
}

describe("ScheduleEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("implements frequency-dependent fields: 24h time, weekday, day-of-month, cron with next-3 preview", async () => {
    const user = userEvent.setup();
    renderEditor();

    expect(screen.getByLabelText("Time, 24-hour")).not.toHaveAttribute("pattern");
    expect(screen.getByRole("button", { name: "Save schedule" }).closest("form")).toHaveAttribute(
      "novalidate",
    );
    await user.click(screen.getByRole("radio", { name: "Weekly" }));
    expect(screen.getByRole("button", { name: "Day of week" })).toBeVisible();
    await user.click(screen.getByRole("radio", { name: "Monthly" }));
    expect(screen.getByRole("button", { name: "Day of month" })).toBeVisible();
    await user.click(screen.getByRole("radio", { name: "Custom cron" }));
    expect(screen.getByLabelText("Cron expression")).toBeVisible();
    expect(
      screen.getByText(/Next three: Fri 06:00, Mon 06:00, Tue 06:00 Europe\/Madrid/),
    ).toBeVisible();
  }, 20_000);

  it("implements Uses project time zone", () => {
    renderEditor();

    expect(screen.getByRole("button", { name: "Time zone" })).toHaveTextContent(
      "Uses project time zone - Europe/Madrid",
    );
  });

  it("implements Start window", () => {
    renderEditor();

    expect(screen.getByRole("button", { name: "Start window" })).toHaveTextContent(
      "Up to 15 minutes",
    );
  });

  it("preserves a distributed daily schedule instead of silently assigning 06:00", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ data: { publicId: schedule.publicId } })));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <ScheduleEditor
        connectedProviders={connectedProviders}
        projectId="prj_story"
        projectDefaults={projectDefaults}
        projectTimezone="Europe/Madrid"
        schedule={{ ...schedule, timeOfDay: null }}
      />,
    );
    expect(screen.getByLabelText("Time, 24-hour")).toHaveValue("");
    expect(screen.getByText("No fixed time - checks are spread across the day.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save schedule" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      timeOfDay: null,
      cronExpression: null,
    });
  });

  it("derives project depth and provider labels from passed defaults", () => {
    renderEditor();

    expect(screen.getByRole("button", { name: "Depth" })).toHaveTextContent(
      `Project default (Top ${projectDefaults.serpDepth})`,
    );
    expect(screen.getByRole("button", { name: "Provider" })).toHaveTextContent(
      "Project default (SerpApi)",
    );
  });

  it("updates the inherited depth label when the project default changes", () => {
    renderEditor({ ...projectDefaults, serpDepth: 50 });

    expect(screen.getByRole("button", { name: "Depth" })).toHaveTextContent(
      "Project default (Top 50)",
    );
  });

  it("implements default toggle names the schedule losing the flag", () => {
    renderEditor();

    expect(screen.getByText(/Replaces Daily 06:00 for new keywords/)).toBeVisible();
  });

  it("lets users undo choosing a default before saving", async () => {
    const user = userEvent.setup();
    renderEditor();
    const toggle = screen.getByRole("switch", { name: /default for new keywords/i });
    await user.click(toggle);
    expect(toggle).toBeChecked();
    expect(toggle).toBeEnabled();
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
  });

  it("keeps the current default selected until another schedule replaces it", () => {
    render(
      <ScheduleEditor
        connectedProviders={connectedProviders}
        defaultScheduleName="Commercial daily"
        projectId="prj_story"
        projectDefaults={projectDefaults}
        projectTimezone="Europe/Madrid"
        schedule={{ ...schedule, isDefault: true }}
      />,
    );

    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.getByText("Default for new keywords")).toBeVisible();
    expect(
      screen.getByText("New keywords use this schedule unless you choose another."),
    ).toBeVisible();
  });

  it("uses the Zod 30-minute validation message instead of native form validation", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.clear(screen.getByLabelText("Time, 24-hour"));
    await user.type(screen.getByLabelText("Time, 24-hour"), "06:15");
    await user.click(screen.getByRole("button", { name: "Save schedule" }));

    expect(await screen.findByText("Enter a time in 30-minute steps.")).toBeVisible();
  });

  it("implements members with pending Moves from", async () => {
    const user = userEvent.setup();
    render(
      <ScheduleEditor
        candidates={[
          {
            device: "Desktop",
            market: "Spain",
            name: "api first cms",
            publicId: "kw_move",
            scheduleId: "sch_other",
            sourceName: "Daily 06:00",
            tags: ["commercial"],
            targetCount: 2,
          },
          {
            device: "Mobile",
            market: "Spain",
            name: "static site generator",
            publicId: "kw_manual",
            scheduleId: null,
            tags: [],
            targetCount: 2,
          },
        ]}
        connectedProviders={connectedProviders}
        projectId="prj_story"
        projectDefaults={projectDefaults}
        projectTimezone="Europe/Madrid"
        schedule={schedule}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add keywords" }));
    expect(screen.getByRole("heading", { name: /Add keywords/ })).toBeVisible();
    expect(screen.getByText("to Commercial daily")).toBeVisible();
  }, 20_000);

  it("stages new schedule keywords in the drawer before assigning them after create", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { publicId: "sch_created" } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { updated: 1 } })));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ScheduleEditor
        connectedProviders={connectedProviders}
        candidates={[
          {
            device: "Desktop",
            market: "Spain",
            name: "api first cms",
            publicId: "kw_move",
            scheduleId: "sch_other",
            sourceName: "Daily 06:00",
            tags: ["commercial"],
            targetCount: 2,
          },
        ]}
        defaultScheduleName="Daily 06:00"
        isNew
        projectId="prj_story"
        projectDefaults={projectDefaults}
        projectTimezone="Europe/Madrid"
        schedule={{ ...schedule, keywordCount: 0, publicId: "new" }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add keywords" }));
    await user.click(screen.getByRole("checkbox", { name: /api first cms/ }));
    await user.click(screen.getByRole("button", { name: "Add 1 keywords" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Moves from Daily 06:00")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Save schedule" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/check-schedules",
      "/api/check-schedules/sch_created/keywords",
    ]);
    expect(routerMock.replace).toHaveBeenCalledWith(
      projectSchedulesPath("prj_story", "sch_created"),
    );
  });

  it("shows the first schedule as the default and saves that default", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { publicId: "sch_created" } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { publicId: "sch_created" } })));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ScheduleEditor
        connectedProviders={connectedProviders}
        defaultScheduleName={null}
        isNew
        projectId="prj_story"
        projectDefaults={projectDefaults}
        projectTimezone="Europe/Madrid"
        schedule={{ ...schedule, keywordCount: 0, publicId: "new" }}
      />,
    );

    expect(screen.getByText("0 keywords")).toBeVisible();
    expect(screen.getByText("No keywords yet. Add some to start scheduled checks.")).toBeVisible();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.getByText("Default for new keywords")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Save schedule" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/check-schedules",
      "/api/check-schedules/sch_created/set-default",
    ]);
  });

  it("implements consequence line counts every move", () => {
    render(
      <ScheduleEditor
        pendingMembers={[
          {
            name: "api first cms",
            pending: true,
            publicId: "kw_move",
            sourceName: "Daily 06:00",
            targetCount: 2,
          },
          { name: "static site generator", pending: true, publicId: "kw_manual", targetCount: 2 },
        ]}
        connectedProviders={connectedProviders}
        projectId="prj_story"
        projectDefaults={projectDefaults}
        projectTimezone="Europe/Madrid"
        schedule={schedule}
      />,
    );

    expect(
      screen.getByText(
        "Saving moves 1 keyword from other schedules and 1 keyword from manual into Commercial daily.",
      ),
    ).toBeVisible();
  });

  it("uses a strict RHF and Zod schema", () => {
    expect(
      scheduleEditorSchema.safeParse({
        cronExpression: "0 6 * * *",
        dayOfMonth: "1st",
        extra: true,
        frequency: "daily",
        isDefault: false,
        jitterMinutes: "15",
        name: "Daily 06:00",
        providerPolicy: "project",
        serpDepth: "project",
        timeOfDay: "06:00",
        timezone: "",
        weekday: "Monday",
      }).success,
    ).toBe(false);
  });

  it("validates depth through the shared depth schema", () => {
    expect(
      scheduleEditorSchema.safeParse({
        cronExpression: "0 6 * * *",
        dayOfMonth: "1st",
        frequency: "daily",
        isDefault: false,
        jitterMinutes: "15",
        name: "Daily 06:00",
        providerPolicy: "project",
        serpDepth: "30",
        timeOfDay: "06:00",
        timezone: "",
        weekday: "Monday",
      }).success,
    ).toBe(false);
  });

  it("keeps the editor as preview-only when the viewer cannot save", () => {
    renderEditor(projectDefaults, { canEdit: false });

    expect(screen.getByText("Preview only")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save schedule" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add keywords" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Add keywords" })).not.toBeInTheDocument();
  });
});
