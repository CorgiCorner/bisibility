import { settingsFixtures } from "@/components/settings/settings-fixtures";
import { canProjectAction } from "@/lib/auth/capabilities";
import type { Role } from "@/lib/generated/prisma/client";
import { FIELD_HELP } from "@/lib/settings/field-help";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DefaultsSection } from "./DefaultsSection";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  updateDefaultRankCheckSettings: vi.fn(async () => ({})),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/lib/actions/settings", () => ({
  updateDefaultRankCheckSettings: mocks.updateDefaultRankCheckSettings,
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function renderDefaults(updateSchedule = vi.fn(async () => ({}))) {
  const view = render(
    <DefaultsSection
      canEdit
      defaults={settingsFixtures.defaults}
      projectId="prj_1"
      updateSchedule={updateSchedule}
    />,
  );

  return { ...view, updateSchedule };
}

function renderCustomCronDefaults() {
  render(
    <DefaultsSection
      canEdit
      defaults={{
        ...settingsFixtures.defaults,
        schedule: {
          ...settingsFixtures.defaults.schedule,
          frequency: "custom_cron",
        },
      }}
      projectId="prj_1"
    />,
  );
}

describe("DefaultsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) } as Response);
  });

  it("labels the default market controls as defaults", () => {
    renderDefaults();

    expect(screen.getByText("Default market")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Default location" })).toHaveDisplayValue(
      "United States",
    );
    expect(screen.getByRole("button", { name: "Default device" })).toHaveTextContent("Desktop");
    expect(screen.getByRole("button", { name: "Default SERP depth" })).toHaveTextContent("Top 100");
    expect(screen.queryByRole("combobox", { name: "Location" })).not.toBeInTheDocument();
  });

  it("shows schedule field help and a searchable full timezone menu", () => {
    renderCustomCronDefaults();

    expect(screen.getByRole("button", { name: FIELD_HELP.frequency })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: FIELD_HELP.cron })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: FIELD_HELP.timezone })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Timezone" }));

    expect(screen.getByRole("textbox", { name: "Search time zones..." })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /America\/Los_Angeles/ })).toBeInTheDocument();
  });

  it("shows schedule metrics for presets and a delta while editing", () => {
    renderDefaults();

    expect(screen.getByText("Every 24 hours per keyword")).toBeInTheDocument();
    expect(screen.queryByText(/Jun 19, 06:00/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Europe\/Warsaw/)).not.toBeInTheDocument();
    expect(screen.getByText("248 checks")).toBeInTheDocument();
    expect(screen.getByText("~7,440 / month")).toBeInTheDocument();
    expect(screen.getByText("~$115.32 / month")).toBeInTheDocument();
    expect(screen.getByText("billed to your own account")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Daily and weekly use a stable per-keyword phase across their interval. Timezone anchors monthly and custom cron schedules only. Jitter adds 0 to 60 minutes of random delay.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Weekly" }));

    expect(screen.getByText("Every 7 days per keyword")).toBeInTheDocument();
    expect(screen.queryByText(/06:00/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Paused" }));

    expect(screen.getByText("Not scheduled")).toBeInTheDocument();
    expect(screen.getByText("~0 / month")).toBeInTheDocument();
    expect(screen.getByText("~ -$115.32/mo vs current")).toBeInTheDocument();
  });

  it("does not price an invalid custom cron", () => {
    render(
      <DefaultsSection
        canEdit
        defaults={{
          ...settingsFixtures.defaults,
          schedule: {
            ...settingsFixtures.defaults.schedule,
            cron_expression: "invalid cron",
            frequency: "custom_cron",
          },
        }}
        projectId="prj_1"
      />,
    );

    expect(screen.getByText("Estimate excludes custom cron schedule")).toBeInTheDocument();
  });

  it("submits a supported depth and warns when lowering it", async () => {
    const { container, updateSchedule } = renderDefaults();

    fireEvent.click(screen.getByRole("button", { name: "Default SERP depth" }));
    fireEvent.click(screen.getByText("Top 20"));

    expect(
      screen.getByText(
        "keywords ranking below 20 will be reported as not found; alerts deeper than 20 will not fire",
      ),
    ).toBeInTheDocument();
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(updateSchedule).toHaveBeenCalledTimes(1));
    expect(updateSchedule).toHaveBeenCalledWith(expect.objectContaining({ serpDepth: 20 }));
  });

  it("submits the project stop-on-match setting", async () => {
    const { container, updateSchedule } = renderDefaults();
    const stopOnMatch = screen.getByRole("switch", {
      name: "Stop checks at first domain match",
    });

    expect(stopOnMatch).toBeChecked();
    fireEvent.click(stopOnMatch);
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(updateSchedule).toHaveBeenCalledTimes(1));
    expect(updateSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ serpStopOnMatch: false }),
    );
  });

  it("submits the selected canonical default location key", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            canonical_key: "US/Texas/Austin",
            city_name: "Austin",
            country_code: "US",
            display_name: "Austin, Texas, United States",
            id: "location:US/Texas/Austin",
            kind: "city",
            region_name: "Texas",
          },
        ],
      }),
    } as Response);
    const { container, updateSchedule } = renderDefaults();

    fireEvent.change(screen.getByRole("combobox", { name: "Default location" }), {
      target: { value: "aus" },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    fireEvent.click(await screen.findByText("Austin"));
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(updateSchedule).toHaveBeenCalledTimes(1));
    expect(updateSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        city: "Austin, Texas, United States",
        country: "United States",
        device: "desktop",
        locationKey: "US/Texas/Austin",
        projectId: "prj_1",
      }),
    );
    expect(mocks.updateDefaultRankCheckSettings).not.toHaveBeenCalled();
  });

  it.each(["viewer", "auditor", "member", "admin", "owner"] satisfies Role[])(
    "renders default controls for the %s role at the update threshold",
    (role) => {
      const canEdit = canProjectAction(role, "update", "project_defaults");
      render(
        <DefaultsSection
          canEdit={canEdit}
          defaults={settingsFixtures.defaults}
          projectId="prj_1"
          updateSchedule={vi.fn()}
        />,
      );

      const location = screen.getByRole("combobox", { name: "Default location" });
      if (canEdit) expect(location).not.toBeDisabled();
      else expect(location).toBeDisabled();
    },
  );
});
