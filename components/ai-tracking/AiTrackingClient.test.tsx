import { paymentQuote } from "@/components/action-payment/payment-test-fixture";
import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import type { TrackingWorkspaceActions } from "@/lib/ai-tracking/projections/workspace-actions";
import { EMPTY_TRACKING_ENGINE_PRICES } from "@/lib/ai-tracking/tracking-engines";
import en from "@/messages/core/en/shared.json";
import es from "@/messages/core/es-ES/shared.json";
import ja from "@/messages/core/ja/shared.json";
import pl from "@/messages/core/pl/shared.json";
import { beforeEach, expect, it, vi } from "vitest";
import { AiTrackingClient } from "./AiTrackingClient";
import { trackingWorkspaceFixture } from "./fixtures";

const mocks = vi.hoisted(() => ({
  workspace: vi.fn(),
  preview: vi.fn(),
  launch: vi.fn(),
}));
vi.mock("./AiTrackingWorkspace", () => ({ AiTrackingWorkspace: mocks.workspace }));
vi.mock("@/lib/actions/ai-tracking", () => ({
  previewAiTrackingAction: mocks.preview,
  launchAiTrackingAction: mocks.launch,
  aiTrackingRunAction: vi.fn(),
  getAiTrackingPage: vi.fn(),
  getAiTrackingRunsAction: vi.fn(),
  getAiTrackingSamplesAction: vi.fn(),
  getAiTrackingTrendsAction: vi.fn(),
  mutateAiTrackingAction: vi.fn(),
  suggestAiTrackingPromptsAction: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.workspace.mockReturnValue(null);
  for (const action of [mocks.preview, mocks.launch]) {
    action.mockResolvedValue({
      ok: false,
      error: { code: "budget_missing", message: "Server fallback" },
    });
  }
});

const locales = [
  ["en", en],
  ["pl", pl],
  ["es-ES", es],
  ["ja", ja],
] as const;
const paths = ["preview", "launch"] as const;
it.each(locales.flatMap(([locale, messages]) => paths.map((path) => ({ locale, messages, path }))))(
  "budget regression: localizes $path failures in $locale",
  async ({ locale, messages, path }) => {
    renderWithFeatureMessages(
      <AiTrackingClient
        data={trackingWorkspaceFixture}
        enginePrices={EMPTY_TRACKING_ENGINE_PRICES}
        projectId="prj_fixture"
      />,
      { locale, messages },
    );
    const { actions } = mocks.workspace.mock.calls[0][0] as { actions: TrackingWorkspaceActions };
    const calls = {
      preview: () => actions.preview([], []),
      launch: () => actions.launch([], { payment: paymentQuote() } as never),
    };
    await expect(calls[path]()).rejects.toThrow(messages.shared.errors.budgetMissing);
    const action = {
      preview: mocks.preview,
      launch: mocks.launch,
    }[path];
    expect(action).toHaveBeenCalledOnce();
  },
);

it("points AI schedules at the common project Schedules page", () => {
  renderWithFeatureMessages(
    <AiTrackingClient
      data={trackingWorkspaceFixture}
      enginePrices={EMPTY_TRACKING_ENGINE_PRICES}
      projectId="prj_fixture"
    />,
    { messages: en },
  );
  const props = mocks.workspace.mock.calls[0][0];
  expect(props).toMatchObject({
    initialDrawer: null,
    initialTab: "prompts",
    researchHref: "/app/prj_fixture/ai-visibility?tab=research",
    schedulesHref: "/app/prj_fixture/schedules",
  });
  expect(props.headerExtra).toBeUndefined();
});
