import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { KeywordDeleteImpact } from "./KeywordDeleteImpact";

it("keeps market/device scope clear without an empty schedule paragraph", () => {
  render(
    <KeywordDeleteImpact
      projectId="prj_example"
      impact={{ keywordCount: 1, targetCount: 2, runningTargetCount: 0, schedules: [] }}
    />,
  );
  expect(screen.getByText("1 keyword · 2 market/device variants")).toBeVisible();
  expect(screen.queryByText(/No schedules are connected/)).toBeNull();
  expect(
    screen.getByText(
      "Deletes selected variants and their rank history. Other markets and devices stay.",
    ),
  ).toBeVisible();
  expect(
    screen.getByText("Queued checks are cancelled. Recorded usage stays in your history."),
  ).toBeVisible();
});
it("preserves the in-flight deletion warning and concise last-member consequence", () => {
  render(
    <KeywordDeleteImpact
      projectId="prj_example"
      impact={{
        keywordCount: 1,
        targetCount: 1,
        runningTargetCount: 1,
        schedules: [
          { publicId: "sch_daily", name: "Daily", removedTargets: 1, remainingTargets: 0 },
        ],
      }}
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("still being checked");
  expect(screen.getByText("Removes 1 check per run.")).toBeVisible();
  expect(
    screen.getByText("This schedule will have no keywords. Add keywords to resume checks."),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "Daily" })).toHaveAttribute(
    "href",
    "/app/prj_example/runs/schedules/sch_daily",
  );
});
