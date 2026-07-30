import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/dynamic", () => ({ default: () => () => null }));

import { DeferredDataGrid } from "./DeferredDataGrid";

describe("deferred keyword data grid", () => {
  it("renders real row content before the interactive grid chunk loads", () => {
    render(
      <div className="h-[650px]">
        <DeferredDataGrid
          columns={[
            { field: "keyword", headerName: "Keyword" },
            { field: "position", headerName: "Position" },
          ]}
          rows={[{ id: "kw_1", keyword: "headless cms", position: 8 }]}
        />
      </div>,
    );

    expect(screen.getByTestId("keyword-grid-fallback")).toHaveTextContent("headless cms");
    expect(screen.getByRole("columnheader", { name: "Keyword" })).toBeInTheDocument();
  });
});
