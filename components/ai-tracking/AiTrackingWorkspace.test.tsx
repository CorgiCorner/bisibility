import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import tracking from "@/messages/core/en/project-ai-tracking.json";
import shared from "@/messages/core/en/shared.json";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AiTrackingWorkspace } from "./AiTrackingWorkspace";
import {
  trackingFixtureActions,
  trackingSampleFixtures,
  trackingWorkspaceFixture,
} from "./fixtures";
import { TrackingEvidenceDrawer } from "./TrackingEvidenceDrawer";

function workspace(props: Partial<Parameters<typeof AiTrackingWorkspace>[0]> = {}) {
  return render(
    <FeatureMessagesProvider locale="en" messages={{ ...shared, ...tracking }} timeZone="UTC">
      <AiTrackingWorkspace
        initialData={trackingWorkspaceFixture}
        actions={trackingFixtureActions}
        {...props}
      />
    </FeatureMessagesProvider>,
  );
}
describe("tracking approval and evidence UI", () => {
  it("preserves the exact typed prompt and does not create a paid baseline when saving", async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue(trackingWorkspaceFixture);
    const launch = vi.fn().mockResolvedValue(trackingWorkspaceFixture);
    workspace({ actions: { ...trackingFixtureActions, save, launch } });
    await user.click(screen.getByRole("button", { name: "Add prompt" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Prompt text"), "  Which tools work?  ");
    await user.click(within(dialog).getByRole("button", { name: "Add prompt" }));
    expect(save).toHaveBeenCalledWith(
      "prompts",
      "POST",
      expect.objectContaining({ text: "  Which tools work?  ", category: "neutral" }),
      undefined,
    );
    expect(launch).not.toHaveBeenCalled();
  });
  it("keeps a preview spend-free and requires explicit consent without clearing the estimate", async () => {
    const user = userEvent.setup();
    const preview = vi.fn(trackingFixtureActions.preview);
    const launch = vi.fn().mockResolvedValue(trackingWorkspaceFixture);
    workspace({ actions: { ...trackingFixtureActions, preview, launch } });
    await user.click(screen.getByRole("button", { name: "Preview run" }));
    const dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Preview configuration and cost" }),
    );
    const approve = await within(dialog).findByRole("button", { name: "Approve and queue run" });
    expect(approve).toBeDisabled();
    expect(within(dialog).getByText("Advisory estimate · $0.0120")).toBeVisible();
    expect(launch).not.toHaveBeenCalled();
    expect(preview).toHaveBeenCalledTimes(1);
    await user.click(
      within(dialog).getByRole("checkbox", {
        name: "I approve this run and the provider actual cost",
      }),
    );
    expect(approve).toBeEnabled();
    expect(within(dialog).getByText("Advisory estimate · $0.0120")).toBeVisible();
    await user.click(approve);
    expect(launch).toHaveBeenCalledWith(
      ["aip_neutral", "aip_branded", "aip_comparison"],
      expect.objectContaining({ credentialVersion: "fixture_credential" }),
    );
  });
  it("shows unknown actual model, retained text, citations and receipt provenance", async () => {
    const user = userEvent.setup();
    workspace({ initialTab: "runs", initialSamples: trackingSampleFixtures });
    await user.click(
      screen.getByRole("button", { name: /Which rank trackers work well.*Consumer scraper/ }),
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/For a small team, consider Acme/)).toBeVisible();
    expect(within(dialog).getByRole("link", { name: "Rank tracking guide" })).toHaveAttribute(
      "href",
      "https://example.com/rank-tracking-guide",
    );
    expect(within(dialog).getByText("confirmed", { exact: false })).toBeVisible();
    expect(within(dialog).getAllByText("Unknown").length).toBeGreaterThan(0);
  });
  it.each([
    { costUsd: null, costState: "unknown", display: "Unknown · unknown" },
    { costUsd: "0.0000", costState: "confirmed", display: "$0.0000 · confirmed" },
    { costUsd: "0.0032", costState: "derived", display: "$0.0032 · derived" },
  ] as const)("keeps actual receipt USD and provenance distinct: $costState", (receipt) => {
    render(
      <FeatureMessagesProvider locale="en" messages={{ ...shared, ...tracking }} timeZone="UTC">
        <TrackingEvidenceDrawer
          sample={{ ...trackingSampleFixtures[2], ...receipt }}
          onClose={vi.fn()}
        />
      </FeatureMessagesProvider>,
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(receipt.display)).toBeVisible();
    expect(within(dialog).getByText("Actual model").nextElementSibling).toHaveTextContent(
      "Unknown",
    );
  });
  it("clears the current cancellation error after a successful retry and retains failed history", async () => {
    const user = userEvent.setup();
    const failedRun = { ...trackingWorkspaceFixture.runs[1], state: "failed" as const };
    const runningRun = { ...trackingWorkspaceFixture.runs[0], state: "running" as const };
    const cancel = vi
      .fn()
      .mockRejectedValueOnce(new Error("Cancellation temporarily unavailable"))
      .mockResolvedValueOnce({
        ...trackingWorkspaceFixture,
        runs: [{ ...runningRun, state: "cancelled" }, failedRun],
      });
    workspace({
      initialTab: "runs",
      initialData: { ...trackingWorkspaceFixture, runs: [runningRun, failedRun] },
      actions: { ...trackingFixtureActions, cancel },
    });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cancellation temporarily unavailable",
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("cancelled", { exact: true })).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("failed", { exact: true })).toBeVisible();
    expect(screen.getByRole("button", { name: /air_oct07.*samples/ })).toBeVisible();
    expect(cancel.mock.calls).toEqual([["air_oct08"], ["air_oct08"]]);
  });
  it("lets viewers read stored history while disabling mutations and paid launch controls", async () => {
    const user = userEvent.setup();
    const save = vi.fn();
    const launch = vi.fn();
    const preview = vi.fn();
    const cancel = vi.fn();
    const samples = vi.fn(trackingFixtureActions.samples);
    workspace({
      initialData: {
        ...trackingWorkspaceFixture,
        canWrite: false,
        runs: [{ ...trackingWorkspaceFixture.runs[0], state: "running" }],
      },
      actions: { ...trackingFixtureActions, save, launch, preview, cancel, samples },
    });
    for (const name of ["Add topic", "Add prompt", "Preview run"])
      expect(screen.getByRole("button", { name })).toBeDisabled();
    for (const button of screen.getAllByRole("button", { name: /^(Edit|Archive)$/ })) {
      expect(button).toBeDisabled();
      await user.click(button);
    }
    await user.click(screen.getByRole("button", { name: "Preview run" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Run history" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: /air_oct08.*samples/ }));
    expect(await screen.findByText("3 of 3 expected samples loaded")).toBeVisible();
    expect(samples).toHaveBeenCalledWith("air_oct08");
    await user.click(screen.getByRole("button", { name: "Schedules" }));
    for (const name of ["Add schedule", "Edit", "Archive"])
      expect(screen.getByRole("button", { name })).toBeDisabled();
    for (const action of [save, launch, preview, cancel]) expect(action).not.toHaveBeenCalled();
  });
});
