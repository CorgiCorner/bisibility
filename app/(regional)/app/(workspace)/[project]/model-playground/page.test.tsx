import { beforeEach, describe, expect, it, vi } from "vitest";
import ModelPlaygroundPage from "./page";

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/lib/actions/model-playground", () => ({ getModelPlaygroundPage: mocks.load }));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: async () => ({ locale: "en", timeZone: "UTC" }),
}));
vi.mock("@/i18n/catalog-loader.server", () => ({ loadCoreMessages: async () => ({}) }));

describe("Model Playground route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads the comparison without an experimental flag", async () => {
    mocks.load.mockResolvedValue({
      canRun: true,
      canTrack: false,
      domain: "acme.example.com",
      engineOptions: [],
      entities: [],
      history: [],
      projectName: "Acme",
      sourceOverrides: [],
      topics: [],
    });
    await ModelPlaygroundPage({ params: Promise.resolve({ project: "prj_1" }) });
    expect(mocks.load).toHaveBeenCalledWith("prj_1");
  });
});
