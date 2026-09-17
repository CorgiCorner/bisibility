import { ProjectDashboardMessages } from "@/components/overview/ProjectDashboardMessages";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ViewAllKeywordsButton } from "./OverviewNoDataBottom";

describe("ViewAllKeywordsButton", () => {
  it("renders a localized serializable anchor to the rank tracker", () => {
    render(
      <ProjectDashboardMessages>
        <ViewAllKeywordsButton projectRef="prj_abc123" />
      </ProjectDashboardMessages>,
    );

    expect(screen.getByRole("link", { name: "View all keywords" })).toHaveAttribute(
      "href",
      "/app/prj_abc123/rank-tracker",
    );
  });
});
