import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { parseProjectRunsQuery } from "@/lib/runs/filters";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ProjectRunsFilters } from "./ProjectRunsFilters";
import { ProjectRunsTimelineTabs } from "./ProjectRunsTimelineTabs";
import { timelineProjectRef } from "./project-runs-timeline.fixtures";

beforeEach(() => vi.clearAllMocks());

function view(search: string) {
  return (
    <>
      <ProjectRunsFilters
        projectRef={timelineProjectRef}
        query={parseProjectRunsQuery(new URLSearchParams(search))}
      />
      <ProjectRunsTimelineTabs
        projectRef={timelineProjectRef}
        query={parseProjectRunsQuery(new URLSearchParams(search))}
      />
    </>
  );
}

it("keeps a section selected independently of the attention filter", () => {
  render(view("section=history&status=attention"));
  expect(
    within(screen.getByRole("radiogroup", { name: "Run timeline" })).getByRole("radio", {
      name: "History",
    }),
  ).toHaveAttribute("aria-checked", "true");
  expect(screen.queryByRole("button", { name: "Needs attention" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Run status" })).toHaveTextContent("Needs attention");
});

it("changes section without dropping attention, source or ordering and clears pagination", () => {
  render(
    view("section=history&status=attention&source=rank_checks&order=asc&limit=50&cursor=older"),
  );
  fireEvent.click(screen.getByRole("radio", { name: "Waiting to start" }));
  expect(routerMock.push).toHaveBeenCalledWith(
    `/app/${timelineProjectRef}/runs?section=upcoming&order=asc&source=rank_checks&status=attention&limit=50`,
  );
});

it("clears attention from the status menu while retaining the selected section", () => {
  const { rerender } = render(view("section=history&status=attention&cursor=older"));
  fireEvent.click(screen.getByRole("button", { name: "Run status" }));
  fireEvent.click(screen.getByText("All statuses"));
  expect(routerMock.push).toHaveBeenCalledWith(`/app/${timelineProjectRef}/runs?section=history`);
  rerender(view("section=history"));
  expect(screen.getByRole("radio", { name: "History" })).toHaveAttribute("aria-checked", "true");
  expect(screen.getByRole("button", { name: "Run status" })).not.toHaveTextContent(
    "Needs attention",
  );
  fireEvent.click(screen.getByRole("button", { name: "Run status" }));
  fireEvent.click(screen.getByText("Needs attention"));
  expect(routerMock.push).toHaveBeenLastCalledWith(
    `/app/${timelineProjectRef}/runs?section=history&status=attention`,
  );
});

it("does not clear the single selected section when it is clicked again", () => {
  render(view("section=history"));
  fireEvent.click(screen.getByRole("radio", { name: "History" }));
  expect(routerMock.push).not.toHaveBeenCalled();
});
