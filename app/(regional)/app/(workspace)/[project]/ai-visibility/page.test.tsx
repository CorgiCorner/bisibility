import { beforeEach, describe, expect, it, vi } from "vitest";
import AiVisibilityPage from "./page";

const mocks = vi.hoisted(() => ({
  brand: vi.fn(() => null),
  overview: vi.fn(() => null),
  research: vi.fn(() => null),
  sources: vi.fn(() => null),
  engines: vi.fn(() => null),
  tracker: vi.fn(() => null),
}));

vi.mock("@/components/ai-tracking/AiTrackingPageContent", () => ({
  AiTrackingPageContent: mocks.tracker,
}));
vi.mock("@/components/ai-tracking/AiVisibilityEnginesContent", () => ({
  AiVisibilityEnginesContent: mocks.engines,
}));
vi.mock("@/components/ai-tracking/AiVisibilityOverviewContent", () => ({
  AiVisibilityOverviewContent: mocks.overview,
}));
vi.mock("@/components/ai-tracking/AiVisibilitySourcesContent", () => ({
  AiVisibilitySourcesContent: mocks.sources,
}));
vi.mock("@/components/ai-tracking/PromptResearchPageContent", () => ({
  PromptResearchPageContent: mocks.research,
}));
vi.mock("@/components/ai-tracking/ResearchBrandLookup", () => ({
  ResearchBrandLookup: mocks.brand,
}));

function open(query?: Record<string, string | string[]>) {
  return AiVisibilityPage({
    params: Promise.resolve({ project: "prj_example" }),
    searchParams: Promise.resolve(query ?? {}),
  });
}

describe("AiVisibilityPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([undefined, "overview"])("renders the overview for tab %s", async (tab) => {
    const view = await open(tab ? { tab } : undefined);
    expect(view.type).toBe(mocks.overview);
    expect(view.props).toEqual({
      project: "prj_example",
      query: tab ? { tab } : {},
    });
  });

  it("renders the sources tab with the same query", async () => {
    const view = await open({ prompts: "unbranded", tab: "sources" });
    expect(view.type).toBe(mocks.sources);
    expect(view.props).toEqual({
      project: "prj_example",
      query: { prompts: "unbranded", tab: "sources" },
    });
  });

  it("renders the tracker for the prompts tab", async () => {
    const view = await open({ tab: "prompts" });
    expect(view.type).toBe(mocks.tracker);
    expect(view.props).toEqual({
      initialDrawer: null,
      initialTab: "prompts",
      moduleTabs: true,
      project: "prj_example",
      query: { tab: "prompts" },
    });
  });

  it("opens the existing run drawer from the overview action", async () => {
    const view = await open({ compose: "run", tab: "prompts" });
    expect(view.type).toBe(mocks.tracker);
    expect(view.props).toMatchObject({ initialDrawer: "run", initialTab: "prompts" });
  });

  it("opens the existing add-prompt drawer from the overview action", async () => {
    const view = await open({ compose: "prompt", tab: "prompts" });
    expect(view.props).toMatchObject({ initialDrawer: "prompt" });
  });

  it("keeps the tracker runs view on the prompts tab", async () => {
    const view = await open({ tab: "prompts", view: "runs" });
    expect(view.type).toBe(mocks.tracker);
    expect(view.props).toMatchObject({ initialTab: "runs", moduleTabs: true });
  });

  it("renders the engines tab last", async () => {
    const view = await open({ tab: "engines" });
    expect(view.type).toBe(mocks.engines);
    expect(view.props).toEqual({ project: "prj_example" });
  });

  it("renders research and keeps the keyword", async () => {
    const view = await open({ q: ["seo tools", "other"], tab: "research" });
    expect(view.type).toBe(mocks.research);
    expect(view.props).toEqual({
      keyword: "seo tools",
      moduleTabs: true,
      project: "prj_example",
    });
  });

  it("opens the brand lookup inside Research", async () => {
    const view = await open({ q: "example.com", tab: "research", view: "brand" });
    expect(view.type).toBe(mocks.brand);
    expect(view.props).toEqual({ project: "prj_example" });
  });
});
