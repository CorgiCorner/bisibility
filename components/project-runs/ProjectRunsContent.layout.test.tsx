import { PROJECT_RUNS_DEFAULT_QUERY } from "@/lib/runs/filters";
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ProjectRunsContent } from "./ProjectRunsContent";

it("separates the Runs toolbar from the table header without adding a table frame", () => {
  render(
    <ProjectRunsContent
      canMutate={false}
      operations={[]}
      page={{ counts: { rankChecks: 0, searchConsole: 0, total: 0 }, nextCursor: null, runs: [] }}
      projectRef="prj_example"
      query={PROJECT_RUNS_DEFAULT_QUERY}
      runNowAction={async () => {}}
      skipAction={async () => {}}
    />,
  );
  const header = screen.getByRole("heading", { name: "0 runs" }).closest("header");
  expect(header).toHaveClass("border-b", "border-border");
  expect(header?.closest("[data-slot=card]")).toHaveClass("[&_[role=table]]:border-0");
});
