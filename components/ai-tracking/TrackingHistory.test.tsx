import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import messages from "@/messages/core/en/project-ai-tracking.json";
import shared from "@/messages/core/en/shared.json";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AiTrackingWorkspace } from "./AiTrackingWorkspace";
import {
  trackingFixtureActions,
  trackingSampleFixtures,
  trackingWorkspaceFixture,
} from "./fixtures";

function workspace(actions = trackingFixtureActions, initialTab: "runs" | "schedules" = "runs") {
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
describe("history pagination and schedule preservation", () => {
  it("loads run/sample cursors, deduplicates pages and drills citations into retained answers", async () => {
    const user = userEvent.setup();
    const samples = vi
      .fn()
      .mockResolvedValueOnce({ items: [trackingSampleFixtures[0]], nextCursor: "more-samples" })
      .mockResolvedValueOnce({
        items: [trackingSampleFixtures[0], trackingSampleFixtures[2]],
        nextCursor: null,
      });
    const runs = vi
      .fn()
      .mockResolvedValue({ items: [trackingWorkspaceFixture.runs[1]], nextCursor: null });
    workspace({ ...trackingFixtureActions, samples, runs });
    await user.click(screen.getByRole("button", { name: /air_oct08.*samples/ }));
    await user.click(await screen.findByRole("button", { name: "Load more samples" }));
    expect(samples.mock.calls).toEqual([["air_oct08"], ["air_oct08", "more-samples"]]);
    expect(screen.getByText("2 of 3 expected samples loaded")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Load more runs" }));
    expect(runs).toHaveBeenCalledWith("more-runs");
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
  it("saves metadata while keeping the saved source/prompt subset and requires explicit replacement review", async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue(trackingWorkspaceFixture);
    const preview = vi.fn(trackingFixtureActions.preview);
    workspace({ ...trackingFixtureActions, save, preview }, "schedules");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/1 saved prompts/)).toBeVisible();
    expect(within(dialog).getByText(/consumer_scrape.*Poland/)).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Save schedule" }));
    expect(save).toHaveBeenCalledWith(
      "schedules",
      "PATCH",
      {
        name: "Weekly consumer check",
        cron: "0 9 * * 1",
        timezone: "Europe/Warsaw",
        enabled: false,
      },
      "ais_weekly",
    );
    expect(preview).not.toHaveBeenCalled();
  });
});
