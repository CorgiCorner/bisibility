import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectRunsFilters } from "./ProjectRunsFilters";

const projectRef = "prj_abcdefghijklmnopqrstuvwx";

describe("ProjectRunsFilters", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps filters in the URL and clears a stale cursor when source changes", () => {
    render(
      <ProjectRunsFilters
        projectRef={projectRef}
        query={{
          cursor: "next-page",
          limit: 20,
          source: "rank_checks",
          status: "all",
          view: "runs",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run source" }));
    fireEvent.click(screen.getByText("Search Console"));

    expect(routerMock.push).toHaveBeenCalledWith(`/app/${projectRef}/runs?source=search_console`);
  });

  it("keeps the selected source while changing status and clears the cursor", () => {
    render(
      <ProjectRunsFilters
        projectRef={projectRef}
        query={{
          cursor: "next-page",
          limit: 20,
          source: "search_console",
          status: "all",
          view: "runs",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run status" }));
    fireEvent.click(screen.getByText("Needs attention"));

    expect(routerMock.push).toHaveBeenCalledWith(
      `/app/${projectRef}/runs?source=search_console&status=attention`,
    );
  });
});
