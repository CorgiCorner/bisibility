import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MarketRunSliceStatus } from "./MarketRunSliceStatus";

function renderRow(runId = "rcr_one") {
  return render(
    <MarketRunSliceStatus marketLabel="Germany / German" projectRef="prj_1" runId={runId} />,
  );
}

describe("MarketRunSliceStatus", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("states the slice once, as a status row rather than a standing banner", () => {
    renderRow();

    const row = screen.getByRole("status");
    expect(row).toHaveTextContent("Germany / German");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("offers both choices and switches nobody on its own", () => {
    renderRow();

    expect(screen.getByRole("link", { name: "View all markets" })).toHaveAttribute(
      "href",
      "/app/prj_1/rank-tracker?run=rcr_one",
    );
    expect(screen.getByRole("button", { name: "Stay in Germany / German" })).toBeInTheDocument();
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it("appears once per run, not once per render", () => {
    const { rerender, unmount } = renderRow();
    const first = screen.getByRole("status");

    rerender(
      <MarketRunSliceStatus marketLabel="Germany / German" projectRef="prj_1" runId="rcr_one" />,
    );

    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toBe(first);

    fireEvent.click(screen.getByRole("button", { name: "Stay in Germany / German" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    unmount();
    renderRow();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    renderRow("rcr_two");
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
