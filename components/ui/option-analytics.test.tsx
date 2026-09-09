import { track } from "@/lib/analytics/client";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Checkbox } from "./Checkbox";
import { MenuMultiSelect, MenuSelect } from "./MenuSelect";
import { Switch } from "./Switch";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));

describe("option analytics", () => {
  beforeEach(() => vi.mocked(track).mockClear());

  it("emits stable option keys from each opted-in control", async () => {
    const user = userEvent.setup();
    render(
      <>
        <MenuSelect
          analytics={{ control: "onboarding.tracking_frequency" }}
          ariaLabel="Frequency"
          onChange={vi.fn()}
          options={[{ label: "Daily", value: "daily" }]}
          value=""
        />
        <MenuMultiSelect
          analytics={{ control: "onboarding.tracking_devices" }}
          ariaLabel="Devices"
          onChange={vi.fn()}
          options={[{ label: "Mobile", value: "mobile" }]}
          values={[]}
        />
        <Switch analytics={{ control: "onboarding.matching_subdomains" }} label="Subdomains" />
        <Checkbox analytics={{ control: "onboarding.matching_url_prefix" }} label="URL prefix" />
      </>,
    );

    await user.click(screen.getByRole("button", { name: "Frequency" }));
    await user.click(await screen.findByRole("menuitem", { name: "Daily" }));
    await user.click(screen.getByRole("button", { name: "Devices" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Mobile" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByText("Subdomains"));
    await user.click(screen.getByText("URL prefix"));

    expect(track).toHaveBeenNthCalledWith(1, "ui_option_selected", {
      control: "onboarding.tracking_frequency",
      module: "onboarding",
      value: "daily",
    });
    expect(track).toHaveBeenNthCalledWith(2, "ui_option_selected", {
      control: "onboarding.tracking_devices",
      module: "onboarding",
      value: ["mobile"],
    });
    expect(track).toHaveBeenNthCalledWith(3, "ui_option_selected", {
      control: "onboarding.matching_subdomains",
      module: "onboarding",
      value: true,
    });
    expect(track).toHaveBeenNthCalledWith(4, "ui_option_selected", {
      control: "onboarding.matching_url_prefix",
      module: "onboarding",
      value: true,
    });
  });

  it("emits nothing when analytics is omitted", async () => {
    render(<Checkbox label="Plain choice" />);
    await userEvent.click(screen.getByText("Plain choice"));
    expect(track).not.toHaveBeenCalled();
  });
});
