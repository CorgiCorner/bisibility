import {
  AdvancedSettingsContentLoading,
  AdvancedSettingsLoading,
} from "@/components/settings/advanced/AdvancedSettingsLoading";
import {
  advancedCardGeometryClassNames,
  advancedLoadingCardGeometryClassNames,
} from "@/components/settings/advanced/advanced-settings-layout";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

const expectedFrames = ["audit", "backup", "hosted-move", "danger"];

describe("Advanced settings loading geometry", () => {
  it("uses the settled backup card as the shared loader geometry truth", () => {
    expect(advancedLoadingCardGeometryClassNames.backup).toBe(
      advancedCardGeometryClassNames.backup,
    );
    expect(advancedCardGeometryClassNames.backup).toBe(
      "h-[324px] sm:h-[286.625px] lg:h-[254.625px]",
    );
  });

  it("keeps one loading frame for every hosted settled card", () => {
    const { container } = render(<AdvancedSettingsContentLoading />);
    expect(
      [...container.querySelectorAll("[data-advanced-loading-frame]")].map((node) =>
        node.getAttribute("data-advanced-loading-frame"),
      ),
    ).toEqual(expectedFrames);
  });

  it("includes the shell geometry used by the route loading boundary", () => {
    const { container } = render(<AdvancedSettingsLoading />);
    expect(
      container.querySelector('[data-settings-loading-boundary="advanced"]'),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("[data-settings-loading-subnav-row]")).toHaveLength(7);
    expect(container.querySelectorAll("[data-settings-loading-frame]")).toHaveLength(4);
  });
});
