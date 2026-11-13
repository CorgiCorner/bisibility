import { PromptResearchPageContent } from "@/components/ai-tracking/PromptResearchPageContent";
import { ProjectNotFoundError } from "@/lib/actions/_shared";
import { AuthorizationError } from "@/lib/auth/authorize";
import { notFound, redirect } from "@/tests/next-navigation";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PromptResearchPage from "./page";

const mocks = vi.hoisted(() => ({
  getPromptResearchPage: vi.fn(),
  loadCoreMessages: vi.fn(),
  resolveRegionalDocumentLocale: vi.fn(),
  ProjectNotFoundError: class extends Error {},
}));

vi.mock("@/lib/actions/_shared", () => ({
  ProjectNotFoundError: mocks.ProjectNotFoundError,
}));
vi.mock("@/lib/auth/audit", () => ({ writeAuditFailure: vi.fn() }));
vi.mock("@/lib/actions/prompt-research", () => ({
  getPromptResearchPage: mocks.getPromptResearchPage,
}));
vi.mock("@/lib/ai-research/research-tab-context", () => ({
  loadResearchTabContext: vi.fn(async () => ({
    competitors: [],
    competitorsHref: "/app/prj_public/settings/competitors",
    dailyUsdPerPrompt: null,
    engines: [],
    entities: [],
    recent: [],
  })),
}));
vi.mock("@/i18n/catalog-loader.server", () => ({ loadCoreMessages: mocks.loadCoreMessages }));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: mocks.resolveRegionalDocumentLocale,
}));
vi.mock("@/components/i18n/FeatureMessagesProvider", () => ({
  FeatureMessagesProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/ai-tracking/AiVisibilityTabs", () => ({ AiVisibilityTabs: () => null }));
vi.mock("@/components/ai-tracking/PromptResearchClient", () => ({
  PromptResearchClient: ({ projectId }: { projectId: string }) => (
    <div data-project={projectId}>Prompt Research</div>
  ),
}));

const notFoundError = new Error("NEXT_HTTP_ERROR_FALLBACK;404");
const pageInput = {
  params: Promise.resolve({ project: "prj_public" }),
  searchParams: Promise.resolve({ q: "tools" }),
};

describe("PromptResearchPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPromptResearchPage.mockResolvedValue({ canWrite: false, topics: [] });
    mocks.loadCoreMessages.mockResolvedValue({});
    mocks.resolveRegionalDocumentLocale.mockResolvedValue({ locale: "en", timeZone: "UTC" });
    notFound.mockImplementation(() => {
      throw notFoundError;
    });
  });

  it("redirects to the research tab and keeps the keyword", async () => {
    await PromptResearchPage(pageInput);
    expect(redirect).toHaveBeenCalledWith("/app/prj_public/ai-visibility?tab=research&q=tools");
  });

  it("renders the authorized project", async () => {
    expect(
      renderToStaticMarkup(
        await PromptResearchPageContent({ keyword: "tools", project: "prj_public" }),
      ),
    ).toContain('data-project="prj_public"');
    expect(mocks.getPromptResearchPage).toHaveBeenCalledWith("prj_public", "tools");
    expect(notFound).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", new ProjectNotFoundError()],
    ["forbidden", new AuthorizationError("forbidden")],
  ])("renders not found for a %s project", async (_reason, error) => {
    mocks.getPromptResearchPage.mockRejectedValue(error);

    await expect(
      PromptResearchPageContent({ keyword: "tools", project: "prj_public" }),
    ).rejects.toBe(notFoundError);
    expect(notFound).toHaveBeenCalledOnce();
  });

  it.each([
    ["unauthenticated", new AuthorizationError("unauthenticated")],
    ["unexpected", new Error("Database unavailable")],
    ["untyped", { code: "forbidden" }],
  ])("preserves %s failures", async (_reason, error) => {
    mocks.getPromptResearchPage.mockRejectedValue(error);

    await expect(
      PromptResearchPageContent({ keyword: "tools", project: "prj_public" }),
    ).rejects.toBe(error);
    expect(notFound).not.toHaveBeenCalled();
  });

  it("does not convert message-loading failures into missing projects", async () => {
    const error = new AuthorizationError("forbidden");
    mocks.loadCoreMessages.mockRejectedValue(error);

    await expect(
      PromptResearchPageContent({ keyword: "tools", project: "prj_public" }),
    ).rejects.toBe(error);
    expect(notFound).not.toHaveBeenCalled();
  });
});
