import { SettingsCard } from "@/components/settings/shell/SettingsCard";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

describe("SettingsCard", () => {
  it("enables its own Save control only after a local field becomes dirty", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <SettingsCard onSave={onSave} title="General">
        <label>
          Project name
          <input defaultValue="Acme" />
        </label>
      </SettingsCard>,
    );

    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    await user.type(screen.getByRole("textbox", { name: "Project name" }), " Labs");
    expect(save).toBeEnabled();

    await user.click(save);
    expect(onSave).toHaveBeenCalledOnce();
    expect(screen.getByText("Saved")).toBeVisible();
    expect(save).toBeDisabled();
  });

  it("omits Save when a card has its own primary action", () => {
    render(
      <SettingsCard showSave={false} title="Plan">
        Plan details
      </SettingsCard>,
    );

    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });
});
