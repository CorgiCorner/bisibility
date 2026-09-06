import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PreferencesForm } from "./PreferencesForm";

const defaults = {
  dateFormat: "day_first",
  density: "standard",
  landing: "dashboard",
  theme: "system",
} as const;

describe("PreferencesForm", () => {
  it("does not advertise timezone or language as account preferences", () => {
    render(
      <PreferencesForm
        autoExample="day_first"
        defaults={defaults}
        todayKey="2026-08-24"
        updatePreferences={vi.fn()}
      />,
    );

    expect(screen.queryByText("Timezone")).not.toBeInTheDocument();
    expect(screen.queryByText("Language")).not.toBeInTheDocument();
    expect(screen.getByText("Date format")).toBeInTheDocument();
    expect(screen.getByText("Default landing page")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Date format" })).toHaveTextContent("24 Aug 2026");
  });

  it("saves exactly the four visible preference fields", async () => {
    const updatePreferences = vi.fn().mockImplementation(async (input) => input);
    render(
      <PreferencesForm
        autoExample="day_first"
        defaults={defaults}
        todayKey="2026-08-24"
        updatePreferences={updatePreferences}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));

    await waitFor(() =>
      expect(updatePreferences).toHaveBeenCalledWith({ ...defaults, theme: "dark" }),
    );
    expect(routerMock.refresh).toHaveBeenCalledOnce();
  });
});
