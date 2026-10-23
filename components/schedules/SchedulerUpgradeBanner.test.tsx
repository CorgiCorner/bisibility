import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import messages from "@/messages/core/en/shared.json";
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { SchedulerUpgradeBanner } from "./SchedulerUpgradeBanner";

it("shows affected keywords and routes to real project schedules and keyword pages", () => {
  render(
    <FeatureMessagesProvider locale="en" timeZone="UTC" messages={messages}>
      <SchedulerUpgradeBanner
        projectId="prj_example"
        issues={[
          { keywordId: "kw_one", keywordText: "seo tools" },
          { keywordId: "kw_two", keywordText: "rank tracker" },
        ]}
      />
    </FeatureMessagesProvider>,
  );
  expect(screen.getByText("2 keywords need schedule review")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open Schedules" })).toHaveAttribute(
    "href",
    "/app/prj_example/runs/schedules",
  );
  expect(screen.getByText("seo tools")).toHaveAttribute(
    "href",
    "/app/prj_example/rank-tracker/kw_one",
  );
  expect(screen.getByText(/Other keywords continue/)).toBeInTheDocument();
});

it("renders no warning when there are no affected keywords", () => {
  const { container } = render(
    <FeatureMessagesProvider locale="en" timeZone="UTC" messages={messages}>
      <SchedulerUpgradeBanner projectId="prj_example" issues={[]} />
    </FeatureMessagesProvider>,
  );
  expect(container).toBeEmptyDOMElement();
});
