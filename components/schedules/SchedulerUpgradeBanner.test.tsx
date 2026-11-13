import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import messages from "@/messages/core/en/shared.json";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { SchedulerUpgradeBanner } from "./SchedulerUpgradeBanner";

const issues = [
  { keywordId: "kw_one", keywordText: "seo tools" },
  { keywordId: "kw_two", keywordText: "rank tracker" },
];

function renderBanner(list = issues) {
  return render(
    <FeatureMessagesProvider locale="en" timeZone="UTC" messages={messages}>
      <SchedulerUpgradeBanner projectId="prj_example" issues={list} />
    </FeatureMessagesProvider>,
  );
}

it("is one row with the count, a short reason and a link to the project schedules", () => {
  renderBanner();
  const notice = screen.getByRole("region", { name: "2 keywords need schedule review" });
  expect(within(notice).getByText("2 keywords need schedule review")).toBeInTheDocument();
  expect(
    within(notice).getByText("Automatic checks are paused until you choose a schedule."),
  ).toBeInTheDocument();
  expect(within(notice).getByRole("link", { name: "Open Schedules" })).toHaveAttribute(
    "href",
    "/app/prj_example/schedules",
  );
  // The keywords stay out of the page flow until they are asked for.
  expect(screen.queryByText("seo tools")).not.toBeInTheDocument();
});

it("lists the affected keywords in a popover, linked to their pages and without raw ids", () => {
  renderBanner();
  const trigger = screen.getByRole("button", { name: "Show keywords" });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  const popover = screen.getByRole("dialog", { name: "Affected keywords" });
  expect(within(popover).getByRole("link", { name: "seo tools" })).toHaveAttribute(
    "href",
    "/app/prj_example/rank-tracker/kw_one",
  );
  expect(within(popover).getByRole("link", { name: "rank tracker" })).toHaveAttribute(
    "href",
    "/app/prj_example/rank-tracker/kw_two",
  );
  expect(within(popover).getByText(/Other keywords continue as configured/)).toBeInTheDocument();
  expect(within(popover).queryByText(/kw_one/)).not.toBeInTheDocument();
});

it("opens a sheet with the keywords and the schedules action from the narrow-screen row", () => {
  renderBanner();
  fireEvent.click(screen.getByRole("button", { name: "Show affected keywords" }));
  const sheet = screen.getByRole("dialog", { name: "2 keywords need schedule review" });
  expect(within(sheet).getByRole("link", { name: "seo tools" })).toHaveAttribute(
    "href",
    "/app/prj_example/rank-tracker/kw_one",
  );
  expect(within(sheet).getByRole("link", { name: "Open Schedules" })).toHaveAttribute(
    "href",
    "/app/prj_example/schedules",
  );
});

it("renders no warning when there are no affected keywords", () => {
  const { container } = renderBanner([]);
  expect(container).toBeEmptyDOMElement();
});
