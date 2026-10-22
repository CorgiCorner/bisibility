import {
  backlinksFeatureTestMessages,
  renderWithBacklinksMessages as render,
  renderWithFeatureMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BacklinksSnapshotMeta } from "./BacklinksSnapshotMeta";
import { backlinksSnapshotFixture } from "./backlinks-fixtures";

describe("BacklinksSnapshotMeta", () => {
  it("identifies a legacy source as unknown instead of assigning DataForSEO", () => {
    render(
      <BacklinksSnapshotMeta
        estimateCents={null}
        snapshot={{ ...backlinksSnapshotFixture, provider: "unknown" }}
      />,
    );
    expect(screen.getByText("Source: Unknown source")).toBeInTheDocument();
    expect(screen.queryByText("Source: DataForSEO")).not.toBeInTheDocument();
  });
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

  it("projects snapshot recency through the scoped catalog", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-24T12:00:00.000Z"));
    const messages = structuredClone(backlinksFeatureTestMessages);
    messages.projectBacklinks.workspace.snapshot.relative.hoursAgo = "{count} godziny temu";

    try {
      renderWithFeatureMessages(
        <BacklinksSnapshotMeta estimateCents={null} snapshot={backlinksSnapshotFixture} />,
        { locale: "pl", messages },
      );

      expect(screen.getByText("cached, free for 22 hours")).toBeInTheDocument();
      expect(screen.getByText("2 godziny temu", { exact: false })).toBeInTheDocument();
      expect(screen.queryByText("2h ago", { exact: false })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders the authoritative supplied unit instead of scalar cents", () => {
    render(
      <BacklinksSnapshotMeta
        estimateCents={125}
        refreshPrice={<span>8 searches</span>}
        onRefresh={() => undefined}
        snapshot={backlinksSnapshotFixture}
      />,
    );
    expect(screen.getByRole("button", { name: /Refresh now/ })).toHaveTextContent("8 searches");
    expect(screen.queryByText(/1.25/)).not.toBeInTheDocument();
  });
});
