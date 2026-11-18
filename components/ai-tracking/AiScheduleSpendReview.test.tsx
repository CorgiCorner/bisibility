import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import tracking from "@/messages/core/en/project-ai-tracking.json";
import shared from "@/messages/core/en/shared.json";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { AiScheduleDrawerHost } from "./AiScheduleDrawerHost";
import { AiTrackingClient } from "./AiTrackingClient";
import type { AiTrackingWorkspace } from "./AiTrackingWorkspace";
import { trackingWorkspaceFixture } from "./fixtures";
import type { TrackingRunDrawer } from "./TrackingRunDrawer";

const mocks = vi.hoisted(() => ({ preview: vi.fn(), mutate: vi.fn() }));
vi.mock("@/lib/schedules/preview-client", async (original) => ({
  ...(await original<typeof import("@/lib/schedules/preview-client")>()),
  requestScheduleChangePreview: mocks.preview,
}));
vi.mock("@/lib/actions/ai-tracking", () => ({ mutateAiTrackingAction: mocks.mutate }));
vi.mock("./TrackingRunDrawer", () => ({
  TrackingRunDrawer: ({ onSaveMetadata }: ComponentProps<typeof TrackingRunDrawer>) => (
    <button
      type="button"
      onClick={() =>
        void onSaveMetadata?.({ name: "Edited", cron: "0 9 * * *", timezone: "UTC", enabled: true })
      }
    >
      Save metadata
    </button>
  ),
}));
vi.mock("./AiTrackingWorkspace", () => ({
  AiTrackingWorkspace: ({ actions }: ComponentProps<typeof AiTrackingWorkspace>) => (
    <button
      type="button"
      onClick={() => void actions.save("schedules", "PATCH", { cron: "0 9 * * *" }, "ais_story")}
    >
      Save schedule
    </button>
  ),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.preview.mockResolvedValue({
    capacity: null,
    requires_review: true,
    review_reasons: ["cost_increase"],
    cost_before_cents: 100,
    cost_after_cents: 700,
    preview_token: "token",
    expected_revision: "1",
    window_start: "2026-10-01T00:00:00.000Z",
  });
  mocks.mutate.mockResolvedValue(trackingWorkspaceFixture);
});
function wrapper(child: React.ReactNode) {
  return (
    <FeatureMessagesProvider locale="en" messages={{ ...shared, ...tracking }} timeZone="UTC">
      {child}
    </FeatureMessagesProvider>
  );
}
it("reviews an AI drawer metadata edit and confirms through the shared hook", async () => {
  const saved = vi.fn();
  render(
    wrapper(
      <AiScheduleDrawerHost
        activePromptIds={[]}
        projectId="prj_story"
        onClose={vi.fn()}
        onSaved={saved}
        schedules={[
          {
            ...trackingWorkspaceFixture.schedules[0],
            archivedAt: null,
            configurations: [],
            promptIds: [],
            nextRunAt: null,
          },
        ]}
        target={trackingWorkspaceFixture.schedules[0].id}
      />,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save metadata" }));
  expect(await screen.findByRole("button", { name: "Confirm" })).toBeVisible();
  expect(mocks.mutate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(mocks.mutate.mock.calls[0][5]).toMatchObject({ preview_token: "token" });
});
it("routes the AI client schedule save through the same review", async () => {
  render(
    wrapper(
      <AiTrackingClient
        projectId="prj_story"
        data={trackingWorkspaceFixture}
        enginePrices={{} as never}
      />,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save schedule" }));
  expect(await screen.findByRole("button", { name: "Confirm" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(mocks.mutate).toHaveBeenCalledOnce());
  expect(mocks.mutate.mock.calls[0][5]).toMatchObject({ preview_token: "token" });
});
