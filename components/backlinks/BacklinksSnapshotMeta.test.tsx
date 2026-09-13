import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BacklinksSnapshotMeta } from "./BacklinksSnapshotMeta";
import { backlinksSnapshotFixture } from "./backlinks-fixtures";

describe("BacklinksSnapshotMeta", () => {
  it("renders stale stored metadata without a refresh action", () => {
    render(
      <BacklinksSnapshotMeta
        estimateCents={null}
        snapshot={backlinksSnapshotFixture}
        storedFreshness={{
          fetchedAt: "2026-08-01T10:00:00.000Z",
          freshUntil: "2026-08-31T10:00:00.000Z",
          stale: true,
        }}
      />,
    );

    expect(screen.getByTestId("stored-result-freshness")).toHaveTextContent("Past refresh window");
    expect(screen.queryByRole("button", { name: /refresh now/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/free for/i)).not.toBeInTheDocument();
  });
});
