import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import messages from "@/messages/core/en/project-ai-tracking.json";
import shared from "@/messages/core/en/shared.json";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { trackingFixtureActions, trackingWorkspaceFixture } from "./fixtures";
import { TrackingTrends } from "./TrackingTrends";

function renderTrends(
  onCompare = trackingFixtureActions.compare,
  onExport = trackingFixtureActions.export,
) {
  render(
    <FeatureMessagesProvider locale="en" messages={{ ...shared, ...messages }} timeZone="UTC">
      <TrackingTrends
        runs={trackingWorkspaceFixture.runs}
        onCompare={onCompare}
        onExport={onExport}
      />
    </FeatureMessagesProvider>,
  );
}
async function selectPreviousRun(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Current run" }));
  await user.click(screen.getByRole("menuitem", { name: /2026-10-07/ }));
}
describe("comparison and export scope", () => {
  it("ignores an export receipt after selecting another run", async () => {
    const user = userEvent.setup();
    let finish!: (value: { complete: boolean; loaded: number; nextCursor: string | null }) => void;
    const response = new Promise<{ complete: boolean; loaded: number; nextCursor: string | null }>(
      (resolve) => {
        finish = resolve;
      },
    );
    const onExport = vi.fn().mockReturnValue(response);
    renderTrends(undefined, onExport);
    await user.click(screen.getByRole("button", { name: "Export JSON" }));
    await selectPreviousRun(user);
    await act(async () => {
      finish({ complete: false, loaded: 1000, nextCursor: "older" });
      await response;
    });
    expect(onExport).toHaveBeenCalledWith("air_oct08", "json", undefined);
    expect(screen.queryByText(/1000 samples/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Continue/ })).toBeNull();
  });
  it("ignores an obsolete comparison after scope changes", async () => {
    const user = userEvent.setup();
    let finish!: (value: Awaited<ReturnType<typeof trackingFixtureActions.compare>>) => void;
    const response = new Promise<Awaited<ReturnType<typeof trackingFixtureActions.compare>>>(
      (resolve) => {
        finish = resolve;
      },
    );
    const onCompare = vi.fn().mockReturnValue(response);
    renderTrends(onCompare);
    await user.click(screen.getByRole("button", { name: "Compare" }));
    await selectPreviousRun(user);
    await act(async () => {
      finish({
        ...(await trackingFixtureActions.compare("air_oct08", "air_oct07")),
        reason: "obsolete comparison result",
      });
      await response;
    });
    expect(screen.queryByText("obsolete comparison result")).toBeNull();
  });
});
