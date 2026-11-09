import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import messages from "@/messages/core/en/project-ai-tracking.json";
import shared from "@/messages/core/en/shared.json";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AiTrackingWorkspace } from "./AiTrackingWorkspace";
import {
  trackingFixtureActions,
  trackingSampleFixtures,
  trackingWorkspaceFixture,
} from "./fixtures";

function workspace(actions = trackingFixtureActions, initialTab: "runs" = "runs") {
  return render(
    <FeatureMessagesProvider locale="en" messages={{ ...shared, ...messages }} timeZone="UTC">
      <AiTrackingWorkspace
        initialTab={initialTab}
        initialData={{ ...trackingWorkspaceFixture, runsNextCursor: "more-runs" }}
        actions={actions}
      />
    </FeatureMessagesProvider>,
  );
}
describe("history pagination", () => {
  it("loads run/sample cursors, deduplicates pages and drills citations into retained answers", async () => {
    const user = userEvent.setup();
    let finishSamples!: () => void;
    const samplePage = new Promise<{ items: typeof trackingSampleFixtures; nextCursor: null }>(
      (resolve) => {
        finishSamples = () =>
          resolve({
            items: [trackingSampleFixtures[0], trackingSampleFixtures[2]],
            nextCursor: null,
          });
      },
    );
    const samples = vi
      .fn()
      .mockResolvedValueOnce({ items: [trackingSampleFixtures[0]], nextCursor: "more-samples" })
      .mockReturnValueOnce(samplePage);
    const runs = vi
      .fn()
      .mockResolvedValue({ items: [trackingWorkspaceFixture.runs[1]], nextCursor: null });
    workspace({ ...trackingFixtureActions, samples, runs });
    await user.click(screen.getByRole("button", { name: /air_oct08.*samples/ }));
    const moreSamples = await screen.findByRole("button", { name: "Load more samples" });
    await waitFor(() => expect(moreSamples).toBeEnabled());
    await user.click(moreSamples);
    expect(samples.mock.calls).toEqual([["air_oct08"], ["air_oct08", "more-samples"]]);
    const moreRuns = screen.getByRole("button", { name: "Load more runs" });
    expect(moreRuns).toBeDisabled();
    expect(runs).not.toHaveBeenCalled();
    await act(async () => {
      finishSamples();
      await samplePage;
    });
    expect(screen.getByText("2 of 3 expected samples loaded")).toBeVisible();
    await waitFor(() => expect(moreRuns).toBeEnabled());
    await user.click(moreRuns);
    await waitFor(() => expect(runs).toHaveBeenCalledWith("more-runs"));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Load more runs" })).not.toBeInTheDocument(),
    );
    expect(screen.getAllByRole("button", { name: /air_oct07.*samples/ })).toHaveLength(1);
    await user.click(screen.getByText(/example.com · 1 citing answers/));
    await user.click(screen.getByText(/https:\/\/example.com\/rank-tracking-guide · 1/));
    await user.click(screen.getByRole("button", { name: /apr_neutral · asm_answer/ }));
    expect(
      within(screen.getByRole("dialog")).getByText(/For a small team, consider Acme/),
    ).toBeVisible();
  });
  it("ignores an old run response when a newer selection resolves first", async () => {
    const user = userEvent.setup();
    let finish!: (value: { items: typeof trackingSampleFixtures; nextCursor: null }) => void;
    const old = new Promise<{ items: typeof trackingSampleFixtures; nextCursor: null }>(
      (resolve) => {
        finish = resolve;
      },
    );
    const samples = vi
      .fn()
      .mockReturnValueOnce(old)
      .mockResolvedValueOnce({ items: [trackingSampleFixtures[2]], nextCursor: null });
    workspace({ ...trackingFixtureActions, samples });
    await user.click(screen.getByRole("button", { name: /air_oct08.*samples/ }));
    await user.click(screen.getByRole("button", { name: /air_oct07.*samples/ }));
    await screen.findByText("1 of 3 expected samples loaded");
    await act(async () => {
      finish({ items: [trackingSampleFixtures[0]], nextCursor: null });
      await old;
    });
    expect(
      screen.queryByRole("button", { name: /Which rank trackers.*Consumer scraper/ }),
    ).toBeNull();
    expect(screen.getByText("1 of 3 expected samples loaded")).toBeVisible();
  });
});
