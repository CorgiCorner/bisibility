import { aiResearchCatalogFixture } from "@/components/ai-research/ai-research-fixtures";
import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import aiMessages from "@/messages/core/en/project-ai-research.json";
import trackingMessages from "@/messages/core/en/project-ai-tracking.json";
import historyMessages from "@/messages/core/en/research-history.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModelPlayground } from "./ModelPlayground";
import { ModelPlaygroundLoading } from "./ModelPlaygroundLoading";
import { modelPlaygroundBlocks, modelPlaygroundLayoutClassName } from "./model-playground-layout";

vi.mock("@/lib/actions/ai-research", () => ({
  analyzeAiResearchAction: vi.fn(),
  getAiResearchCatalogAction: vi.fn(),
}));
vi.mock("@/lib/actions/ai-tracking", () => ({ mutateAiTrackingAction: vi.fn() }));
vi.mock("@/lib/actions/research-history", () => ({
  loadModelPlaygroundHistoryAction: vi.fn(async () => ({
    ok: true,
    page: { chips: [], groups: [], nextCursor: null, pinnedCount: 0, timeZone: "UTC", total: 0 },
  })),
}));
vi.mock("@/lib/actions/research-history-pins", () => ({
  pinResearchHistoryAction: vi.fn(),
  unpinResearchHistoryAction: vi.fn(),
}));

const messages = { ...sharedMessages, ...aiMessages, ...trackingMessages, ...historyMessages };
const base = {
  canRun: true,
  domain: "example.com",
  entities: [],
  projectId: "prj_example",
  projectName: "Example",
  sourceOverrides: [],
  topics: [],
};

function blocks(container: HTMLElement) {
  return [...container.querySelectorAll("[data-model-playground-block]")].map((node) =>
    node.getAttribute("data-model-playground-block"),
  );
}

describe("model playground loading", () => {
  it("shares the composer, toolbar and results blocks and skips the provider notice", () => {
    const page = renderWithFeatureMessages(
      <ModelPlayground {...base} catalog={aiResearchCatalogFixture} engineOptions={[]} />,
      { messages },
    );
    const loading = render(<ModelPlaygroundLoading />);
    expect(blocks(loading.container)).toEqual(blocks(page.container));
    expect(blocks(loading.container)).toEqual(["composer", "results", "toolbar"]);
    expect(loading.container.querySelector("[data-model-playground-layout]")).toHaveClass(
      ...modelPlaygroundLayoutClassName.split(" "),
    );
    expect(page.container.querySelector("[data-model-playground-layout]")).toHaveClass(
      ...modelPlaygroundLayoutClassName.split(" "),
    );
    expect(loading.container.querySelector("[data-provider-locked]")).toBeNull();
    expect(loading.container.querySelector("[data-model-playground-block='composer']")).toHaveClass(
      "model-playground-composer-loading",
    );
    expect(modelPlaygroundBlocks).toEqual(["composer", "toolbar", "results"]);
  });

  it("does not reserve the provider notice that the page can show on first paint", () => {
    const page = renderWithFeatureMessages(
      <ModelPlayground {...base} catalogFailure="no_source" engineOptions={[]} />,
      { messages },
    );
    const loading = render(<ModelPlaygroundLoading />);
    expect(page.container.querySelector("[data-provider-locked]")).not.toBeNull();
    expect(loading.container.querySelector("[data-provider-locked]")).toBeNull();
    expect(
      loading.container.querySelector("[data-model-playground-layout]")?.firstElementChild,
    ).toHaveAttribute("data-model-playground-block", "composer");
  });
});
