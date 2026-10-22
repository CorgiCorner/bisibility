import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScheduleObjectFrame } from "./ScheduleObjectFrame";

describe("ScheduleObjectFrame", () => {
  it("omits the redundant breadcrumb when schedule navigation already provides the return path", () => {
    render(
      <ScheduleObjectFrame
        bodyLabel="Schedule body"
        breadcrumbLabel="Breadcrumb"
        title="Daily"
        navigation={<a href="/app/prj_1/runs/schedules">Schedules</a>}
      />,
    );
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
    expect(screen.getByRole("link", { name: "Schedules" })).toBeVisible();
  });
  it("renders a caret-left back link for list and editor entry points", () => {
    const { rerender } = render(
      <ScheduleObjectFrame
        bodyLabel="Schedule body"
        breadcrumbLabel="Breadcrumb"
        breadcrumb={{ href: "/app/prj_1/rank-tracker", label: "Rank Tracker" }}
        subtitle="Not saved yet. It runs on its cadence once saved with at least one keyword."
        title="Schedule"
      />,
    );

    expect(screen.getByRole("link", { name: "Rank Tracker" })).toHaveAttribute(
      "href",
      "/app/prj_1/rank-tracker",
    );
    expect(screen.getByRole("link", { name: "Rank Tracker" }).querySelector("svg")).toBeVisible();
    expect(
      screen.getByText(
        "Not saved yet. It runs on its cadence once saved with at least one keyword.",
      ),
    ).toBeVisible();

    rerender(
      <ScheduleObjectFrame
        bodyLabel="Schedule body"
        breadcrumbLabel="Breadcrumb"
        breadcrumb={{ href: "/app/prj_1/runs/schedules", label: "All schedules" }}
        title="Schedule"
      />,
    );

    expect(screen.getByRole("link", { name: "All schedules" })).toHaveAttribute(
      "href",
      "/app/prj_1/runs/schedules",
    );
    expect(screen.getByRole("link", { name: "All schedules" }).querySelector("svg")).toBeVisible();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });
});
