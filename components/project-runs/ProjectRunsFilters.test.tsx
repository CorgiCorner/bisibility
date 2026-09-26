import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, screen } from "@testing-library/react";
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

  it("offers only the statuses of the selected source and clears the cursor", () => {
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

    expect(screen.queryByText("Deferred")).toBeNull();
    expect(screen.queryByText("Needs attention")).toBeNull();
    fireEvent.click(screen.getByText("Waiting for Google"));

    expect(routerMock.push).toHaveBeenCalledWith(
      `/app/${projectRef}/runs?source=search_console&status=waiting_for_google`,
    );
  });

  it("groups statuses by source and sets both when one is chosen", () => {
    render(
      <ProjectRunsFilters
        projectRef={projectRef}
        query={{ cursor: null, limit: 20, source: "all", status: "all", view: "runs" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run status" }));

    expect(screen.getAllByText("Rank checks").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Queued")).toHaveLength(2);
    expect(screen.queryByText("Upcoming")).toBeNull();
    fireEvent.click(screen.getByText("Planned"));

    expect(routerMock.push).toHaveBeenCalledWith(
      `/app/${projectRef}/runs?source=rank_checks&status=planned`,
    );
  });

  it("shows a legacy group value without offering it", () => {
    render(
      <ProjectRunsFilters
        projectRef={projectRef}
        query={{ cursor: null, limit: 20, source: "all", status: "attention", view: "runs" }}
      />,
    );

    expect(screen.getByRole("button", { name: "Run status" }).textContent).toContain(
      "Needs attention",
    );
  });

  it("resets a status the new source cannot show", () => {
    render(
      <ProjectRunsFilters
        projectRef={projectRef}
        query={{ cursor: null, limit: 20, source: "all", status: "importing", view: "runs" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run source" }));
    fireEvent.click(screen.getByText("Rank checks"));

    expect(routerMock.push).toHaveBeenCalledWith(`/app/${projectRef}/runs?source=rank_checks`);
  });
});
