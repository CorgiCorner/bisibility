import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import messages from "@/messages/core/en/project-ai-tracking.json";
import shared from "@/messages/core/en/shared.json";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
  await within(dialog).findByText(/Forecast:/);
  await waitFor(() =>
    expect(
      within(dialog).getByRole("button", { name: "Preview draft generation cost" }),
    ).toBeEnabled(),
  );
  return dialog;
}
describe("reviewed model suggestion generation", () => {
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
    expect(
      within(dialog).getByRole("button", { name: /^Approve and generate drafts/ }),
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
    await user.click(within(dialog).getByRole("button", { name: /^Approve and generate drafts/ }));
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
    await user.click(within(dialog).getByRole("button", { name: /^Approve and generate drafts/ }));
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

it("shows an exhausted budget returned through the real action-result consumer", async () => {
  const { unwrapTrackingGenerationActionResult } = await import(
    "@/lib/ai-tracking/projections/generation-result"
  );
  const user = userEvent.setup();
  const generate = vi.fn(async () =>
    unwrapTrackingGenerationActionResult<never>(
      JSON.parse(
        JSON.stringify({
          ok: false,
          error: {
            code: "budget_exhausted",
            status: 429,
            reason: "budget_exhausted",
            message: "Monthly provider budget reached.",
            generationId: "asg_budget",
          },
        }),
      ),
    ),
  );
  render(
    wrap(
      <TrackingGeneration
        canWrite
        actions={{ ...generationFixtureActions, generate }}
        onReviewDraft={vi.fn()}
      />,
    ),
  );
  const dialog = await reviewAndPreview(user);
  await user.click(within(dialog).getByRole("button", { name: /^Approve and generate drafts/ }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "Monthly provider budget reached.",
  );
  expect(within(dialog).getByText(/Generation requiring review: asg_budget/)).toBeVisible();
  expect(generate).toHaveBeenCalledOnce();
});
