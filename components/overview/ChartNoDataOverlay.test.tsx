import { ProjectDashboardMessages } from "@/components/overview/ProjectDashboardMessages";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChartNoDataOverlay } from "./ChartNoDataOverlay";

describe("ChartNoDataOverlay", () => {
  it("uses the sunken surface token for the icon well", () => {
    const { container } = render(
      <ProjectDashboardMessages>
        <ChartNoDataOverlay />
      </ProjectDashboardMessages>,
    );

    const iconWell = container.querySelector("svg")?.closest("span");
    expect(iconWell).toHaveClass("bg-bg-sunken");
    expect(iconWell).not.toHaveAttribute("style");
  });
});
