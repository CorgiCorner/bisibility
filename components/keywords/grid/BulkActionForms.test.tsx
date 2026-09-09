import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { ToastProvider } from "@/components/ui/Toast";
import type { KeywordRow } from "@/lib/queries/keywords";
import { FIELD_HELP } from "@/lib/settings/field-help";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SetScheduleModal } from "./SetScheduleModal";
import type { CheckScheduleSummary } from "./set-schedule-model";

const schedules = [
  {
    cronExpression: null,
    enabled: true,
    frequency: "daily",
    isDefault: true,
    jitterMinutes: 60,
    keywordCount: 1,
    name: "Daily 06:00",
    publicId: "sch_daily",
    serpDepth: null,
    timeOfDay: "06:00",
    timezone: "UTC",
  },
] satisfies CheckScheduleSummary[];

function renderForm() {
  const selectedRows = [
    {
      ...(keywordRows[0] as KeywordRow),
      projectSerpDepth: 20 as const,
      projectTimezone: "Europe/Warsaw",
      schedule: {
        ...(keywordRows[0] as KeywordRow).schedule,
        frequency: "weekly" as const,
        serp_depth: 100 as const,
      },
    },
  ];
  render(
    <ToastProvider>
      <SetScheduleModal
        initialView="new"
        onClose={vi.fn()}
        onDone={vi.fn()}
        open
        projectId="prj_1"
        providerRate={{ overrideCents: 1, providerId: "dataforseo" }}
        schedules={schedules}
        selectedRows={selectedRows}
      />
    </ToastProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("New schedule from selection", () => {
  it("uses the selected cadence for the name and inherits project depth, not keyword depth", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => ({ data: { publicId: "sch_new" } }), ok: true })
      .mockResolvedValueOnce({ json: async () => ({ data: { updated: 1 } }), ok: true });
    vi.stubGlobal("fetch", fetchMock);
    renderForm();
    expect(screen.getByText("Project default (Top 20)")).toBeVisible();
    await user.click(screen.getByRole("radio", { name: "Weekly" }));
    await user.click(screen.getByRole("button", { name: "Day" }));
    await user.click(screen.getByRole("menuitem", { name: "Friday" }));
    await user.click(screen.getByRole("button", { name: "Time" }));
    await user.click(screen.getByRole("menuitem", { name: "08:00" }));
    expect(screen.getByLabelText("Name")).toHaveValue("Weekly · Fri 08:00");
    await user.click(screen.getByRole("button", { name: "Create schedule" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      name: "Weekly · Fri 08:00",
      frequency: "weekly",
      cronExpression: "0 8 * * 5",
      serpDepth: null,
    });
  });

  it("shows help for each schedule field", () => {
    renderForm();

    expect(screen.getByRole("button", { name: FIELD_HELP.frequency })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: FIELD_HELP.timezone })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: FIELD_HELP.jitter })).toBeInTheDocument();
    expect(screen.getByLabelText("Jitter (min)")).toHaveDisplayValue("15");
    expect(screen.getByLabelText("Jitter (min)")).toHaveAttribute("max", "120");

    fireEvent.click(screen.getByRole("radio", { name: "Custom cron" }));

    expect(screen.getByRole("button", { name: FIELD_HELP.cron })).toBeInTheDocument();
  });

  it("can return from an explicit zone to the project zone before saving", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => ({ data: { publicId: "sch_new" } }), ok: true })
      .mockResolvedValueOnce({ json: async () => ({ data: { updated: 1 } }), ok: true });
    vi.stubGlobal("fetch", fetchMock);
    renderForm();
    expect(screen.getByRole("button", { name: "Timezone" })).toHaveTextContent(
      "Uses project time zone - Europe/Warsaw",
    );
    await user.click(screen.getByRole("button", { name: "Timezone" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search time zones..." }), {
      target: { value: "UTC" },
    });
    await user.click(screen.getByRole("menuitem", { name: /^UTC/ }));
    await user.click(screen.getByRole("button", { name: "Timezone" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search time zones..." }), {
      target: { value: "" },
    });
    await user.click(
      screen.getByRole("menuitem", { name: "Uses project time zone - Europe/Warsaw" }),
    );
    await user.click(screen.getByRole("button", { name: "Create schedule" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      timezone: null,
      jitterMinutes: 15,
    });
  });

  it("selects a validated timezone from the searchable catalogue", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => ({ data: { publicId: "sch_new" } }), ok: true })
      .mockResolvedValueOnce({ json: async () => ({ data: { updated: 1 } }), ok: true });
    vi.stubGlobal("fetch", fetchMock);
    renderForm();

    await user.click(screen.getByRole("button", { name: "Timezone" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search time zones..." }), {
      target: { value: "warsaw" },
    });
    await user.click(screen.getByRole("menuitem", { name: /^Europe\/Warsaw/ }));
    await user.click(screen.getByRole("button", { name: "Create schedule" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toMatchObject(
      expect.objectContaining({ timezone: "Europe/Warsaw" }),
    );
  });
});
