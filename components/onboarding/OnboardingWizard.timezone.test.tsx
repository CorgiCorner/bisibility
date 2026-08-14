import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { project, renderWizard } from "./OnboardingWizard.test-utils";

describe("OnboardingWizard timezone", () => {
  it("adopts the captured timezone into the schedule draft after project creation", async () => {
    const createProjectAction = vi.fn(async () => ({ ...project, timezone: "Europe/Madrid" }));
    renderWizard({ actions: { createProjectAction } });

    fireEvent.change(screen.getByLabelText("Your website"), {
      target: { value: "https://www.example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(createProjectAction).toHaveBeenCalledTimes(1));
    const skipProvider = await screen.findByRole("button", {
      name: "Skip provider connection and add keywords as paused",
    });
    fireEvent.click(skipProvider);

    await screen.findByRole("heading", { name: "Add your first keywords" });
    const timezoneInput = screen.getByDisplayValue("Europe/Madrid") as HTMLInputElement;
    expect(timezoneInput).toHaveAttribute("type", "hidden");
    expect(timezoneInput).toHaveAttribute("name", "timezone");
  });
});
