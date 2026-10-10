import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { navItems } from "@/lib/nav/nav-items";
import { PROJECT_RUNS_DEFAULT_QUERY } from "@/lib/runs/filters";
import { screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
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
  expect(header).not.toHaveClass("border-b");
  const table = screen.getByRole("table");
  expect(table).toHaveAttribute("data-bordered", "false");
  expect(table.querySelector('[role="rowgroup"] > [role="row"]')).toHaveClass(
    "border-y",
    "border-border",
  );
  const empty = screen.getByRole("heading", { name: "No runs yet" }).closest("[data-empty-state]");
  const moduleIcon = navItems("prj_example").find((item) => item.label === "Runs")?.icon;
  if (!moduleIcon) throw new Error("Runs navigation icon is missing");
  const expected = document.createElement("div");
  const Icon = moduleIcon;
  expected.innerHTML = renderToStaticMarkup(<Icon size={22} weight="regular" />);
  expect(empty?.querySelector("svg")?.innerHTML).toBe(expected.querySelector("svg")?.innerHTML);
});
