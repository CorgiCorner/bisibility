import { serpDepthSchema } from "@/lib/schemas/serp-depth";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { ScheduleEditorFields } from "./ScheduleEditorFields";
import type { ScheduleEditorValues } from "./ScheduleEditorModel";

function ScheduleEditorFieldsHarness() {
  const form = useForm<ScheduleEditorValues>({
    defaultValues: {
      cronExpression: "0 6 * * 1-5",
      dayOfMonth: "1st",
      frequency: "daily",
      isDefault: false,
      jitterMinutes: "15",
      name: "Commercial daily",
      providerPolicy: "project",
      serpDepth: "project",
      timeOfDay: "06:00",
      timezone: "",
      weekday: "Monday",
    },
  });

  return (
    <ScheduleEditorFields
      connectedProviders={[{ label: "SerpApi", value: "serpapi" }]}
      defaultScheduleName="Daily 06:00"
      form={form}
      projectDefaults={{ provider: { label: "SerpApi", value: "serpapi" }, serpDepth: 20 }}
      projectTimezone="Europe/Madrid"
      referenceIso="2026-09-03T10:00:00.000Z"
    />
  );
}

describe("ScheduleEditorFields", () => {
  it("uses the compact control height for every frequency-dependent control", async () => {
    const user = userEvent.setup();
    render(<ScheduleEditorFieldsHarness />);

    const heightClass = (element: HTMLElement) =>
      [...element.classList].find((className) => className.startsWith("min-h-"));
    const heights = [heightClass(screen.getByLabelText("Time, 24-hour"))];

    await user.click(screen.getByRole("radio", { name: "Weekly" }));
    heights.push(heightClass(screen.getByRole("button", { name: "Day of week" })));

    await user.click(screen.getByRole("radio", { name: "Monthly" }));
    heights.push(heightClass(screen.getByRole("button", { name: "Day of month" })));

    await user.click(screen.getByRole("radio", { name: "Custom cron" }));
    heights.push(heightClass(screen.getByLabelText("Cron expression")));

    expect(heights).toEqual(["min-h-[34px]", "min-h-[34px]", "min-h-[34px]", "min-h-[34px]"]);
  });

  it("offers each schema depth in order", async () => {
    const user = userEvent.setup();
    render(<ScheduleEditorFieldsHarness />);

    await user.click(screen.getByRole("button", { name: "Depth" }));
    const depthOptions = screen
      .getAllByRole("menuitem")
      .slice(1)
      .map((option) => Number(option.textContent?.replace("Always Top ", "")));
    const schemaDepths = serpDepthSchema.options.map((option) => option.value);

    expect(depthOptions).toHaveLength(schemaDepths.length);
    expect(depthOptions).toEqual(schemaDepths);
  });

  it("distinguishes project defaults from schedule-pinned provider and depth overrides", async () => {
    const user = userEvent.setup();
    render(<ScheduleEditorFieldsHarness />);

    expect(
      screen.getAllByText(
        "Project default follows the project settings. Always pins this schedule.",
      ),
    ).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Provider" }));
    expect(screen.getByRole("menuitem", { name: "Project default (SerpApi)" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Always SerpApi" })).toBeVisible();

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Depth" }));
    expect(screen.getByRole("menuitem", { name: "Project default (Top 20)" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Always Top 20" })).toBeVisible();
  });
});
