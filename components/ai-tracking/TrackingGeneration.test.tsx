import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import messages from "@/messages/core/en/project-ai-tracking.json";
import shared from "@/messages/core/en/shared.json";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AiTrackingWorkspace } from "./AiTrackingWorkspace";
import { trackingFixtureActions, trackingWorkspaceFixture } from "./fixtures";
import {
  generationFixtureActions,
  generationSnapshotFixture,
  oversizedGenerationActions,
  staleGenerationActions,
  unknownGenerationActions,
} from "./generation-fixtures";
import { TrackingGeneration } from "./TrackingGeneration";

function wrap(child: React.ReactNode) {
  return (
    <FeatureMessagesProvider locale="en" messages={{ ...shared, ...messages }} timeZone="UTC">
      {child}
    </FeatureMessagesProvider>
  );
}
async function reviewAndPreview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Review context and model" }));
  const dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByRole("textbox", { name: "Model" }), "gpt-4.1-mini");
  await user.click(within(dialog).getByRole("button", { name: "Preview draft generation cost" }));
  await within(dialog).findByText(/Advisory estimate/);
  return dialog;
}
describe("reviewed model suggestion generation", () => {
  it("requires consent, preserves full context, accepts an edited draft with trusted provenance and never launches a run", async () => {
    const user = userEvent.setup();
    const preview = vi.fn(generationFixtureActions.preview);
    const generate = vi.fn(generationFixtureActions.generate);
    const save = vi.fn(trackingFixtureActions.save);
    const launch = vi.fn(trackingFixtureActions.launch);
    render(
      wrap(
        <AiTrackingWorkspace
          initialData={trackingWorkspaceFixture}
          actions={{
            ...trackingFixtureActions,
            launch,
            save,
            generation: { ...generationFixtureActions, preview, generate },
          }}
        />,
      ),
    );
    const dialog = await reviewAndPreview(user);
    expect(preview.mock.calls[0][0].inputSnapshot).toEqual(generationSnapshotFixture);
    const run = within(dialog).getByRole("button", { name: "Approve and generate drafts" });
    expect(run).toBeDisabled();
    await user.click(within(dialog).getByRole("checkbox", { name: /provider actual cost/ }));
    await user.click(run);
    await within(dialog).findByText("asg_abcdefghijklmnopqrstuvwx");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][1]).toMatch(/^[a-f0-9-]{36}$/);
    await user.click(within(dialog).getAllByRole("button", { name: "Review draft" })[0]);
    const promptDialog = await screen.findByRole("dialog");
    const text = within(promptDialog).getByRole("textbox", { name: "Prompt text" });
    await user.clear(text);
    await user.type(text, "  Edited generated question?  ");
    await user.click(within(promptDialog).getByRole("button", { name: "Add prompt" }));
    expect(save).toHaveBeenCalledWith(
      "prompts",
      "POST",
      expect.objectContaining({
        text: "  Edited generated question?  ",
        generationReference: {
          generationId: "asg_abcdefghijklmnopqrstuvwx",
          draftId: "12345678-1234-4234-8234-000000000001",
        },
      }),
      undefined,
    );
    expect(launch).not.toHaveBeenCalled();
  });
  it("preserves oversized full context and prevents preview until the user explicitly narrows it", async () => {
    const user = userEvent.setup();
    const preview = vi.fn(generationFixtureActions.preview);
    render(
      wrap(
        <TrackingGeneration
          canWrite
          actions={{ ...oversizedGenerationActions, preview }}
          onReviewDraft={vi.fn()}
        />,
      ),
    );
    await user.click(screen.getByRole("button", { name: "Review context and model" }));
    const dialog = await screen.findByRole("dialog");
    const business = within(dialog).getByRole("textbox", { name: "Business" });
    expect(business).toHaveValue("Full reviewed context. ".repeat(300));
    expect(
      within(dialog).getByRole("button", { name: "Preview draft generation cost" }),
    ).toBeDisabled();
    expect(preview).not.toHaveBeenCalled();
  });
  it("allows read-only context and price review while blocking paid generation", async () => {
    const user = userEvent.setup();
    const generate = vi.fn(generationFixtureActions.generate);
    render(
      wrap(
        <TrackingGeneration
          canWrite={false}
          actions={{ ...generationFixtureActions, generate }}
          onReviewDraft={vi.fn()}
        />,
      ),
    );
    const dialog = await reviewAndPreview(user);
    await user.click(within(dialog).getByRole("checkbox", { name: /provider actual cost/ }));
    expect(
      within(dialog).getByRole("button", { name: "Approve and generate drafts" }),
    ).toBeDisabled();
    expect(generate).not.toHaveBeenCalled();
  });
  it("retains the durable unknown attempt ID and prevents replay after changing reviewed input", async () => {
    const user = userEvent.setup();
    const generate = vi.fn(unknownGenerationActions.generate);
    render(
      wrap(
        <TrackingGeneration
          canWrite
          actions={{ ...unknownGenerationActions, generate }}
          onReviewDraft={vi.fn()}
        />,
      ),
    );
    const dialog = await reviewAndPreview(user);
    await user.click(within(dialog).getByRole("checkbox", { name: /provider actual cost/ }));
    await user.click(within(dialog).getByRole("button", { name: "Approve and generate drafts" }));
    await within(dialog).findByText(/Generation requiring review: asg_abcdefghijklmnopqrstuvwx/);
    await user.type(within(dialog).getByRole("textbox", { name: "Goals" }), " Revised");
    expect(
      within(dialog).getByRole("button", { name: "Preview draft generation cost" }),
    ).toBeDisabled();
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it("allows a new review after a known stale denial and ignores an obsolete context load", async () => {
    const user = userEvent.setup();
    const generate = vi.fn(staleGenerationActions.generate);
    const view = render(
      wrap(
        <TrackingGeneration
          canWrite
          actions={{ ...staleGenerationActions, generate }}
          onReviewDraft={vi.fn()}
        />,
      ),
    );
    const dialog = await reviewAndPreview(user);
    await user.click(within(dialog).getByRole("checkbox", { name: /provider actual cost/ }));
    await user.click(within(dialog).getByRole("button", { name: "Approve and generate drafts" }));
    await within(dialog).findByText(/This preview is stale/);
    // The stale notice renders before the preview action leaves its busy state.
    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: "Preview draft generation cost" }),
      ).toBeEnabled(),
    );
    view.unmount();
    let finish!: (value: Awaited<ReturnType<typeof generationFixtureActions.review>>) => void;
    const old = new Promise<Awaited<ReturnType<typeof generationFixtureActions.review>>>(
      (resolve) => {
        finish = resolve;
      },
    );
    const review = vi
      .fn()
      .mockReturnValueOnce(old)
      .mockResolvedValueOnce({
        inputSnapshot: {
          ...generationSnapshotFixture,
          context: { ...generationSnapshotFixture.context, business: "New current review" },
        },
        contextUpdatedAt: null,
      });
    render(
      wrap(
        <TrackingGeneration
          canWrite
          actions={{ ...generationFixtureActions, review }}
          onReviewDraft={vi.fn()}
        />,
      ),
    );
    await user.click(screen.getByRole("button", { name: "Review context and model" }));
    await user.click(screen.getByRole("button", { name: "Close drawer" }));
    await user.click(screen.getByRole("button", { name: "Review context and model" }));
    await screen.findByRole("textbox", { name: "Business" });
    await act(async () => {
      finish(await generationFixtureActions.review());
      await old;
    });
    expect(screen.getByRole("textbox", { name: "Business" })).toHaveValue("New current review");
  });
});
