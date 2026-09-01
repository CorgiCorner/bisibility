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

describe("Advanced settings loading geometry", () => {
  it("uses the settled backup card as the shared loader geometry truth", () => {
    expect(advancedLoadingCardGeometryClassNames.backup).toBe(
      advancedCardGeometryClassNames.backup,
    );
    expect(advancedCardGeometryClassNames.backup).toBe("min-h-[254px]");
    expect(advancedCardGeometryClassNames.backup).not.toMatch(/(?:^|\s)(?:sm:|lg:)?h-\[/);
  });

  it("uses the settled transfer card as the self-host loader geometry", () => {
    expect(advancedLoadingCardGeometryClassNames.migration).toBe(
      advancedCardGeometryClassNames.migration,
    );
  });

  it("keeps one loading frame for every self-host settled card", () => {
    const { container } = render(<AdvancedSettingsContentLoading deployment="self-host" />);
    expect(
      [...container.querySelectorAll("[data-advanced-loading-frame]")].map((node) =>
        node.getAttribute("data-advanced-loading-frame"),
      ),
    ).toEqual(["audit", "self-host-migration", "danger"]);
  });

  it("keeps one loading frame for every hosted settled card", () => {
    const { container } = render(<AdvancedSettingsContentLoading deployment="cloud" />);
    expect(
      [...container.querySelectorAll("[data-advanced-loading-frame]")].map((node) =>
        node.getAttribute("data-advanced-loading-frame"),
      ),
    ).toEqual(["audit", "backup", "danger"]);
  });

  it("includes the shell geometry used by the route loading boundary", () => {
    const { container } = render(<AdvancedSettingsLoading />);
    expect(
      container.querySelector('[data-settings-loading-boundary="advanced"]'),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("[data-settings-loading-subnav-row]")).toHaveLength(8);
    expect(container.querySelectorAll("[data-settings-loading-frame]")).toHaveLength(3);
  });
});
