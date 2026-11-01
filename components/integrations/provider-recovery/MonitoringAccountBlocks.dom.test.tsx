import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { MonitoringAccountBlocks } from "./MonitoringAccountBlocks";

it("identifies each blocked connection and states the deferred count range", () => {
  render(
    <MonitoringAccountBlocks
      projectRef="prj_example"
      blocks={[
        { connectionId: "one", provider: "DataForSEO", deferred: 2 },
        { connectionId: "two", provider: "SerpApi", deferred: 1 },
      ]}
    />,
  );
  expect(
    screen.getByText(/DataForSEO: connection paused.*2 checks deferred.*last 30 days/),
  ).toBeVisible();
  expect(
    screen.getByText(/SerpApi: connection paused.*1 check deferred.*last 30 days/),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "View connections" })).toHaveAttribute(
    "href",
    "/app/prj_example/providers",
  );
});
