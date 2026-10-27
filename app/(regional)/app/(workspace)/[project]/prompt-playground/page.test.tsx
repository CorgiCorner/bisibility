import { notFound } from "@/tests/next-navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PromptPlaygroundPage from "./page";

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(),
  load: vi.fn(),
}));
vi.mock("@/lib/queries/experimental-modules", () => ({ getExperimentalModules: mocks.enabled }));
vi.mock("@/lib/actions/ai-research", () => ({ getAiResearchPage: mocks.load }));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: async () => ({ locale: "en", timeZone: "UTC" }),
}));
vi.mock("@/i18n/catalog-loader.server", () => ({ loadCoreMessages: async () => ({}) }));

describe("Prompt Playground experimental route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notFound.mockImplementation(() => {
      throw new Error("not found");
    });
  });
  it("rejects direct links before loading stored prompts when disabled", async () => {
    mocks.enabled.mockResolvedValue([]);
    await expect(
      PromptPlaygroundPage({ params: Promise.resolve({ project: "prj_1" }) }),
    ).rejects.toThrow("not found");
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("loads the existing prompt workspace after activation", async () => {
    mocks.enabled.mockResolvedValue(["promptPlayground"]);
    mocks.load.mockResolvedValue({});
    await PromptPlaygroundPage({ params: Promise.resolve({ project: "prj_1" }) });
    expect(mocks.load).toHaveBeenCalledWith("prj_1", "prompt");
  });
});
