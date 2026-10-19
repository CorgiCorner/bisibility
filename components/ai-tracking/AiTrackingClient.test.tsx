import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import type { TrackingWorkspaceActions } from "@/lib/ai-tracking/projections/workspace-actions";
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
  suggestionPreview: vi.fn(),
  generate: vi.fn(),
  review: vi.fn(),
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
vi.mock("@/lib/actions/ai-research", () => ({ getAiResearchCatalogAction: vi.fn() }));
vi.mock("@/lib/actions/ai-tracking-suggestions", () => ({
  previewAiTrackingSuggestionsAction: mocks.suggestionPreview,
  generateAiTrackingSuggestionsAction: mocks.generate,
  getAiTrackingSuggestionReviewAction: mocks.review,
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.workspace.mockReturnValue(null);
  for (const action of [
    mocks.preview,
    mocks.launch,
    mocks.suggestionPreview,
    mocks.generate,
    mocks.review,
  ]) {
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
const paths = [
  "preview",
  "launch",
  "suggestion preview",
  "suggestion generate",
  "suggestion review",
] as const;
it.each(locales.flatMap(([locale, messages]) => paths.map((path) => ({ locale, messages, path }))))(
  "budget regression: localizes $path failures in $locale",
  async ({ locale, messages, path }) => {
    renderWithFeatureMessages(
      <AiTrackingClient projectId="prj_fixture" data={trackingWorkspaceFixture} />,
      { locale, messages },
    );
    const { actions } = mocks.workspace.mock.calls[0][0] as { actions: TrackingWorkspaceActions };
    const calls = {
      preview: () => actions.preview([], []),
      launch: () => actions.launch([], {} as never),
      "suggestion preview": () => actions.generation?.preview({} as never),
      "suggestion generate": () => actions.generation?.generate({} as never, "request_1"),
      "suggestion review": () => actions.generation?.review(),
    };
    await expect(calls[path]()).rejects.toThrow(messages.shared.errors.budgetMissing);
    const action = {
      preview: mocks.preview,
      launch: mocks.launch,
      "suggestion preview": mocks.suggestionPreview,
      "suggestion generate": mocks.generate,
      "suggestion review": mocks.review,
    }[path];
    expect(action).toHaveBeenCalledOnce();
  },
);

it("points AI schedules at the common project Schedules page", () => {
  renderWithFeatureMessages(
    <AiTrackingClient projectId="prj_fixture" data={trackingWorkspaceFixture} />,
    { messages: en },
  );
  expect(mocks.workspace.mock.calls[0][0]).toMatchObject({
    schedulesHref: "/app/prj_fixture/runs/schedules",
  });
});

it("preserves exhausted budget metadata through the generation caller", async () => {
  mocks.generate.mockResolvedValue({
    ok: false,
    error: {
      code: "budget_exhausted",
      status: 429,
      reason: "budget_exhausted",
      message: "Monthly provider budget reached.",
      generationId: "asg_budget",
    },
  });
  renderWithFeatureMessages(
    <AiTrackingClient projectId="prj_fixture" data={trackingWorkspaceFixture} />,
    { messages: en },
  );
  const { actions } = mocks.workspace.mock.calls[0][0] as { actions: TrackingWorkspaceActions };
  await expect(actions.generation?.generate({} as never, "request_1")).rejects.toMatchObject({
    code: "budget_exhausted",
    status: 429,
    reason: "budget_exhausted",
    message: "Monthly provider budget reached.",
    generationId: "asg_budget",
  });
});
