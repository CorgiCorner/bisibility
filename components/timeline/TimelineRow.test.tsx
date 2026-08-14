import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimelineRow } from "./TimelineRow";

describe("TimelineRow", () => {
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
});
