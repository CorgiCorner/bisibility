import { ProjectWriteModeProvider } from "@/components/shell/ProjectWriteModeProvider";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildGoogleSerpUrl, DimensionSwitcher, localeForLocation } from "./DimensionSwitcher";

describe("DimensionSwitcher", () => {
  it("builds locale metadata and encoded Google result URLs", () => {
    expect(localeForLocation({ countryCode: "", gl: "pl", hl: "pl" })).toEqual({
      code: "PL",
      gl: "pl",
      hl: "pl",
    });
    expect(buildGoogleSerpUrl("rank tracker", { countryCode: "PL", gl: "pl", hl: "pl" })).toContain(
      "q=rank%20tracker&gl=pl&hl=pl",
    );
  });

  it("opens device options and tracks a selected dimension", () => {
    const onTrack = vi.fn();
    render(
      <DimensionSwitcher
        icon={<span>device</span>}
        kind="device"
        label="desktop"
        onTrack={onTrack}
        value="desktop"
      />,
    );
    const trigger = screen.getByRole("button", { name: /desktop/i });
    fireEvent.click(trigger);

    const current = screen.getByRole("menuitem", { name: "desktop, currently shown" });
    const addMobile = screen.getByRole("menuitem", { name: "Add Mobile" });
    expect(current).toHaveAttribute("aria-current", "true");
    expect(current).toHaveClass("Mui-selected");
    expect(addMobile.querySelector("svg")).not.toBeNull();
    expect(addMobile).toHaveTextContent("Mobile+ Track");
    expect(screen.queryByRole("menuitem", { name: "Add Desktop" })).not.toBeInTheDocument();

    fireEvent.click(addMobile);
    expect(onTrack).toHaveBeenCalledWith("device", "Mobile");
  });

  it("uses a bounded menu and returns focus to the chip on Escape", async () => {
    render(
      <DimensionSwitcher
        icon={<span>device</span>}
        kind="device"
        label="desktop"
        onTrack={vi.fn()}
        value="desktop"
      />,
    );

    const trigger = screen.getByRole("button", { name: /desktop/i });
    trigger.focus();
    fireEvent.click(trigger);

    const menu = screen.getByRole("menu");
    const paper = menu.closest(".MuiPaper-root");
    expect(paper).toHaveStyle({ maxWidth: "calc(100vw - 24px)", width: "290px" });

    fireEvent.keyDown(menu, { key: "Escape" });
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("includes a custom location and links to live SERP results", () => {
    render(
      <DimensionSwitcher
        icon={<span>location</span>}
        kind="location"
        label="Warsaw"
        onTrack={vi.fn()}
        serpHref="https://google.example/search"
        value="Warsaw"
      />,
    );
    expect(screen.getByRole("link", { name: /Open live Google results/ })).toHaveAttribute(
      "href",
      "https://google.example/search",
    );
    fireEvent.click(screen.getByRole("button", { name: /Warsaw/i }));
    expect(screen.getByText(/only tracking Warsaw/)).toBeInTheDocument();
  });

  it("disables writable dimension changes in read-only mode", () => {
    render(
      <ProjectWriteModeProvider projectRef="prj_1" writeMode="migration_hold">
        <DimensionSwitcher
          icon={<span>device</span>}
          kind="device"
          label="desktop"
          onTrack={vi.fn()}
          value="desktop"
        />
      </ProjectWriteModeProvider>,
    );
    expect(screen.getByRole("button", { name: /desktop/i })).toBeDisabled();
  });

  it("disables dimension changes when tracking is unavailable", () => {
    render(
      <DimensionSwitcher
        icon={<span>device</span>}
        kind="device"
        label="desktop"
        value="desktop"
      />,
    );

    expect(screen.getByRole("button", { name: /desktop/i })).toBeDisabled();
  });
});
