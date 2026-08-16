import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PreferencesForm } from "./PreferencesForm";

const defaults = {
  dateFormat: "eu",
  density: "standard",
  landing: "dashboard",
  theme: "system",
} as const;

describe("PreferencesForm", () => {
  it("does not advertise timezone or language as account preferences", () => {
    render(<PreferencesForm defaults={defaults} updatePreferences={vi.fn()} />);

    expect(screen.queryByText("Timezone")).not.toBeInTheDocument();
    expect(screen.queryByText("Language")).not.toBeInTheDocument();
    expect(screen.getByText("Date format")).toBeInTheDocument();
    expect(screen.getByText("Default landing page")).toBeInTheDocument();
  });

  it("saves exactly the four visible preference fields", async () => {
    const updatePreferences = vi.fn().mockImplementation(async (input) => input);
    render(<PreferencesForm defaults={defaults} updatePreferences={updatePreferences} />);

    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));

    await waitFor(() =>
      expect(updatePreferences).toHaveBeenCalledWith({ ...defaults, theme: "dark" }),
    );
    expect(routerMock.refresh).toHaveBeenCalledOnce();
  });
});
