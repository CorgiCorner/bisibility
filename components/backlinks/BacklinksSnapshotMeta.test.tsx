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

      expect(screen.getByText("2 godziny temu", { exact: false })).toBeInTheDocument();
      expect(screen.queryByText("2h ago", { exact: false })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    [125, "~1,25 USD"],
    [0.5, "~< 0,01 USD"],
    [0.1, "~< 0,01 USD"],
    [0.49, "~< 0,01 USD"],
    [-50, "~-0,50 USD"],
    [-0.5, "~-< 0,01 USD"],
    [-0.1, "~-< 0,01 USD"],
  ])("localizes the refresh estimate for %s cents", (estimateCents, expected) => {
    const messages = structuredClone(backlinksFeatureTestMessages);
    const snapshot = messages.projectBacklinks.workspace.snapshot;
    snapshot.refresh = "Odswiez";
    snapshot.refreshEstimate = "~{amount}";
    snapshot.refreshEstimateUnderCent = "~{sign}< {amount}";

    renderWithFeatureMessages(
      <BacklinksSnapshotMeta
        estimateCents={estimateCents}
        onRefresh={() => undefined}
        snapshot={backlinksSnapshotFixture}
      />,
      { locale: "pl", messages },
    );

    const refresh = screen.getByRole("button", { name: /Odswiez/ });
    expect(refresh).toHaveTextContent(expected);
    expect(refresh).not.toHaveTextContent("$");
  });
});
