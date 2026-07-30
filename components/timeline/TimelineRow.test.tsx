import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimelineRow } from "./TimelineRow";

describe("TimelineRow", () => {
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
