import type { TimelineItem } from "@/lib/timeline/timeline-data";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimelineRow } from "./TimelineRow";

const manualNote: TimelineItem = {
  date: "Aug 29",
  id: "sig_abcdefghijklmnopqrstuvwx",
  icon: "notes",
  meta: "Manual · by M",
  removable: false,
  time: "11:42 PM",
  tint: "green",
  title: "test",
};

describe("TimelineRow", () => {
  it("uses the full row width without a leading marker column", () => {
    render(
      <TimelineRow
        canDelete={false}
        item={{
          date: "2026-08-14",
          icon: "rankings",
          id: "sig_full_width",
          meta: "Rank tracker",
          removable: false,
          time: "12:40",
          tint: "green",
          title: "Position 12 -> 8",
        }}
        projectId="prj_1"
      />,
    );

    const row = document.querySelector("#signal-sig_full_width");

    expect(row).toHaveAttribute("id", "signal-sig_full_width");
    expect(row).toHaveClass("flex");
    expect(row).not.toHaveClass("transition-colors", "hover:bg-bg-sunken");
    expect(row).not.toHaveAttribute("role", "button");
    expect(row).not.toHaveAttribute("tabindex");
    expect(row?.children).toHaveLength(1);
    expect(row?.firstElementChild).toHaveClass("grid", "min-w-0", "flex-1");
  });

  it("renders the keyword market delta with an accessible device icon", () => {
    render(
      <TimelineRow
        canDelete={false}
        item={{
          date: "2026-08-14",
          icon: "rankings",
          id: "sig_market",
          marketMeta: {
            device: "mobile",
            segments: ["architect malaga", "Malaga, Spain", "Spanish", "Rank tracker"],
          },
          meta: "architect malaga / Malaga, Spain / Spanish / Mobile / Rank tracker",
          removable: false,
          time: "12:40",
          tint: "green",
          title: "Position 12 -> 8",
        }}
        projectId="prj_1"
      />,
    );

    expect(screen.getByText("architect malaga")).toBeVisible();
    expect(screen.getByText("Malaga, Spain")).toBeVisible();
    expect(screen.getByText("Spanish")).toBeVisible();
    expect(screen.getByRole("img", { name: "Mobile" })).toHaveAttribute("title", "Mobile");
    expect(screen.queryByText(/Keyword:/)).not.toBeInTheDocument();
  });

  it("renders deploy payload details and the test marker", () => {
    render(
      <TimelineRow
        canDelete={false}
        item={{
          badge: "Test event",
          date: "2026-07-25",
          details: [
            { label: "Provider", value: "Generic" },
            { label: "Deployment ID", value: "test_123" },
            { label: "Environment", value: "test" },
            { label: "Paths", value: "/, /pricing" },
          ],
          icon: "deploys",
          id: "sig_test",
          meta: "Deploy",
          removable: false,
          time: "21:00",
          tint: "green",
          title: "Deploy completed",
        }}
        projectId="prj_1"
      />,
    );

    expect(screen.getByText("Test event")).toBeVisible();
    expect(screen.getByText("Generic")).toBeVisible();
    expect(screen.getByText("test_123")).toBeVisible();
    expect(screen.getByText("test")).toBeVisible();
    expect(screen.getByText("/, /pricing")).toBeVisible();
    expect(document.querySelector("#signal-sig_test")).toBeInTheDocument();
  });
  it("centers desktop columns without position top-padding compensation", () => {
    const { rerender } = render(
      <TimelineRow canDelete={false} item={manualNote} projectId="prj_abcdefghijklmnopqrstuvwx" />,
    );

    const row = screen.getByText("test").closest("[id^='signal-']");
    expect(row).toHaveClass("items-center");
    expect(row).not.toHaveClass("items-start");

    const grid = row?.firstElementChild;
    expect(grid).toHaveClass("md:items-center");
    expect(grid).not.toHaveClass("md:items-start");
    expect(screen.getByText("Manual · by M")).toBeInTheDocument();
    expect(screen.getByText("Aug 29")).toBeInTheDocument();
    expect(screen.getByText("11:42 PM")).toBeInTheDocument();

    rerender(
      <TimelineRow
        canDelete={false}
        item={{ ...manualNote, id: "sig_bcdefghijklmnopqrstuvwxy", position: "#7" }}
        projectId="prj_abcdefghijklmnopqrstuvwx"
      />,
    );

    expect(screen.getByText("#7")).not.toHaveClass("md:pt-1");
  });
});
