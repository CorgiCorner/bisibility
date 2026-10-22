import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { PROJECT_RUNS_DEFAULT_QUERY } from "@/lib/runs/filters";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { aiHistoryFixtures } from "./ai-runs.fixtures";
import { ProjectRunsContent } from "./ProjectRunsContent";

it("shows AI partial and cost-limit skips as readable historical runs with a real result link", () => {
  render(
    <ProjectRunsContent
      canMutate={false}
      operations={[]}
      page={{
        counts: { aiTracking: 2, rankChecks: 0, searchConsole: 0, total: 2 },
        nextCursor: null,
        runs: aiHistoryFixtures,
      }}
      projectRef="prj_abcdefghijklmnopqrstuvwx"
      query={{ ...PROJECT_RUNS_DEFAULT_QUERY, source: "ai_tracking", status: "attention" }}
      runNowAction={vi.fn()}
      skipAction={vi.fn()}
    />,
  );
  expect(screen.getByRole("button", { name: "Run source" })).toHaveTextContent("AI Tracking");
  expect(screen.getByText("Cost limit exceeded")).toBeVisible();
  expect(screen.getByText("Partial")).toBeVisible();
  expect(screen.getByRole("radio", { name: "History" })).toBeVisible();
  fireEvent.click(
    screen.getAllByRole("button", { name: "Actions for AI tracking measurement" })[0],
  );
  fireEvent.click(screen.getByRole("menuitem", { name: "View details" }));
  expect(routerMock.push).toHaveBeenCalledWith(aiHistoryFixtures[0].href);
  expect(screen.queryByRole("menuitem", { name: "Run now" })).not.toBeInTheDocument();
});
