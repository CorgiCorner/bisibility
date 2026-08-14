import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UpcomingSection, type UpcomingSectionProps } from "./UpcomingSection";
import {
  emptyUpcomingView,
  upcomingNoProviderView,
  upcomingUnblockedView,
  upcomingViewFixture,
} from "./upcoming-fixtures";
import { formatEstimatedCost } from "./upcoming-format";

const sharedProps = {
  mode: "rail",
  providerSettingsHref: "/app/settings#providers",
  schedulesHref: "/app/rank-tracker",
  timeZone: "Europe/Warsaw",
  timelineHref: "/app/settings#migration",
  view: upcomingViewFixture,
} satisfies UpcomingSectionProps;

describe("UpcomingSection", () => {
  const originalTZ = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = "UTC";
  });

  afterEach(() => {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  });

  it("keeps positive sub-cent estimates visible", () => {
    expect(formatEstimatedCost(0)).toBe("~$0.00");
    expect(formatEstimatedCost(0.35)).toBe("<$0.01");
    expect(formatEstimatedCost(1)).toBe("~$0.01");
  });

  it("renders the rail hierarchy and expanded day with project-zone sample times", () => {
    render(<UpcomingSection {...sharedProps} initialExpandedDayKey="2026-07-24" />);

    expect(screen.getByText("Upcoming")).toBeInTheDocument();
    expect(screen.getByText("Forecast")).toBeInTheDocument();
    expect(screen.getByText("214 checks")).toBeInTheDocument();
    expect(screen.getByText("~$0.45 est.")).toBeInTheDocument();
    expect(screen.getByText("flow dictation app")).toBeInTheDocument();
    expect(screen.queryByText("~2h")).not.toBeInTheDocument();
    expect(screen.queryByText("~3h")).not.toBeInTheDocument();
    expect(screen.queryByText(/14:17/)).not.toBeInTheDocument();
    expect(screen.getByText(/Jul 24, 16:17/)).toBeInTheDocument();
    expect(screen.getAllByText(/\(Europe\/Warsaw\)/).length).toBe(3);
    expect(screen.queryByText("hidden fourth sample")).not.toBeInTheDocument();

    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" &&
          element.textContent ===
            "At the current daily rate the $50 cap lasts until ~Aug 8. Forecast for scheduled checks: ~$5.30/next 48h.",
      ),
    ).toBeInTheDocument();
  });

  it("uses project-zone times for a future day", () => {
    render(<UpcomingSection {...sharedProps} view={upcomingUnblockedView} />);

    fireEvent.click(screen.getByRole("button", { name: /Tomorrow/ }));

    expect(screen.getByText("example")).toBeInTheDocument();
    expect(screen.getByText(/Jul 25, 09:37/)).toBeInTheDocument();
    expect(screen.queryByText(/~09:00/)).not.toBeInTheDocument();
    expect(screen.queryByText(/~09:37/)).not.toBeInTheDocument();
  });

  it("renders slim day cards without samples and keeps the manage link visible", () => {
    render(<UpcomingSection {...sharedProps} mode="slim" view={upcomingUnblockedView} />);

    const days = screen.getByRole("region", { name: "Upcoming days" });
    expect(days.querySelector(".grid-cols-2")).not.toBeNull();
    expect(within(days).queryByText("example")).not.toBeInTheDocument();
    expect(
      within(days).getByRole("link", { name: "Manage schedules in Keywords" }),
    ).toHaveAttribute("href", "/app/rank-tracker");
  });

  it("opens a strip day sheet and closes it from the backdrop", async () => {
    render(<UpcomingSection {...sharedProps} mode="strip" view={upcomingViewFixture} />);

    const strip = screen.getByRole("region", { name: "Upcoming checks" });
    expect(strip.firstElementChild).toHaveTextContent(
      "2 will never run · 1 on hold · 4 over budget",
    );

    fireEvent.click(within(strip).getByRole("button", { name: /Today, 214 checks/ }));

    const dialog = screen.getByRole("dialog", { name: "Today" });
    expect(within(dialog).getByText("flow dictation app")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("link", { name: "Manage schedules in Keywords" }),
    ).toHaveAttribute("href", "/app/rank-tracker");

    fireEvent.click(screen.getByLabelText("Close upcoming details"));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Today" })).not.toBeInTheDocument(),
    );
  });

  it("keeps the no-provider reason in the red never-run card by itself", () => {
    render(<UpcomingSection {...sharedProps} view={upcomingNoProviderView} />);

    const blocked = screen.getByRole("region", { name: "Blocked scheduled checks" });
    expect(within(blocked).getByText("2 checks will never run")).toBeInTheDocument();
    expect(within(blocked).getByText("No provider assigned · 2 keywords")).toBeInTheDocument();
    expect(within(blocked).getByRole("link", { name: "Connect" })).toHaveAttribute(
      "href",
      "/app/settings#providers",
    );
    expect(within(blocked).queryByText(/Paused during import/)).not.toBeInTheDocument();
    expect(within(blocked).queryByText(/Monthly budget reached/)).not.toBeInTheDocument();
  });

  it("separates all blocked reasons into their own entries", () => {
    render(<UpcomingSection {...sharedProps} />);

    const blocked = screen.getByRole("region", { name: "Blocked scheduled checks" });
    expect(within(blocked).getByText("2 checks will never run")).toBeInTheDocument();
    expect(within(blocked).getByText("Paused during import · 1 keyword")).toBeInTheDocument();
    expect(within(blocked).getByText("Monthly budget reached · 4 keywords")).toBeInTheDocument();
    expect(within(blocked).getByRole("link", { name: "Review" })).toHaveAttribute(
      "href",
      "/app/settings#migration",
    );
    expect(within(blocked).getByRole("link", { name: "Review budget" })).toHaveAttribute(
      "href",
      "/app/settings#providers",
    );
  });

  it("omits blocked alerts when there are no blocked reasons", () => {
    render(<UpcomingSection {...sharedProps} view={upcomingUnblockedView} />);

    expect(
      screen.queryByRole("region", { name: "Blocked scheduled checks" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Upcoming days" })).toBeInTheDocument();
  });

  it("renders an explicit quiet empty state", () => {
    render(<UpcomingSection {...sharedProps} view={emptyUpcomingView} />);

    expect(screen.getByText("No scheduled keywords")).toBeInTheDocument();
    expect(
      screen.getByText("Set a schedule in Keywords to see the next checks here."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage schedules in Keywords" })).toHaveAttribute(
      "href",
      "/app/rank-tracker",
    );
  });
});
