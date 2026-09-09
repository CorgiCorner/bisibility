import { PROJECT_RUNS_DEFAULT_QUERY } from "@/lib/runs/filters";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectRunsTabs } from "./ProjectRunsTabs";

describe("ProjectRunsTabs", () => {
  it.each(["runs", "schedules"] as const)("keeps all destinations visible from %s", (active) => {
    render(<ProjectRunsTabs active={active} projectRef="prj_1" />);
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Runs", "Schedules"]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/app/prj_1/runs",
      "/app/prj_1/runs/schedules",
    ]);
    expect(links.filter((link) => link.getAttribute("aria-current") === "page")).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: active === "runs" ? "Runs" : "Schedules" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("preserves the Upcoming filter and source in the Runs tab without carrying the cursor", () => {
    render(
      <ProjectRunsTabs
        active="runs"
        projectRef="prj_1"
        query={{
          ...PROJECT_RUNS_DEFAULT_QUERY,
          cursor: "old-page",
          source: "rank_checks",
          view: "planned",
          limit: 50,
        }}
      />,
    );
    expect(screen.getByRole("link", { name: "Runs" })).toHaveAttribute(
      "href",
      "/app/prj_1/runs?view=planned&source=rank_checks&limit=50",
    );
    expect(screen.getByRole("link", { name: "Schedules" })).toHaveAttribute(
      "href",
      "/app/prj_1/runs/schedules",
    );
  });
});
