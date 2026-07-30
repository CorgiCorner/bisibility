import { ProjectWriteModeProvider } from "@/components/shell/ProjectWriteModeProvider";
import { fireEvent, render, screen } from "@testing-library/react";
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
    fireEvent.click(screen.getByRole("button", { name: /desktop/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /mobile/i }));
    expect(onTrack).toHaveBeenCalledWith("device", "Mobile");
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
