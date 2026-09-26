import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BacklinksPage from "./page";

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  context: vi.fn(),
  demo: vi.fn(),
  listStored: vi.fn(),
  readStored: vi.fn(),
  resolve: vi.fn(),
  runtime: vi.fn(),
  selector: vi.fn(),
  messages: vi.fn(),
  translate: vi.fn(),
  translator: vi.fn(),
  workspace: vi.fn(),
}));

vi.mock("@/components/backlinks/BacklinksWorkspace", () => ({
  BacklinksWorkspace: (props: unknown) => {
    mocks.workspace(props);
    return <div data-testid="backlinks-workspace" />;
  },
}));
vi.mock("@/components/backlinks/BacklinksMessagesBoundary", () => ({
  BacklinksMessagesBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/demo-research/StoredBacklinksView", () => ({
  StoredBacklinksView: () => <div data-testid="stored-backlinks" />,
}));
vi.mock("@/components/demo-research/StoredResultSelector", () => ({
  StoredResultSelector: (props: unknown) => {
    mocks.selector(props);
    return <div data-testid="stored-selector" />;
  },
}));
vi.mock("@/components/i18n/FeatureMessagesProvider", () => ({
  FeatureMessagesProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/i18n/catalog-loader.server", () => ({ loadCoreMessages: vi.fn(async () => ({})) }));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: vi.fn(async () => ({ locale: "en", timeZone: "UTC" })),
}));
vi.mock("@/i18n/translator.server", () => ({ createIntlTranslator: () => (key: string) => key }));
vi.mock("@/components/shell/PageContent", () => ({
  PageContent: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/lib/actions/backlinks", () => ({
  analyzeBacklinksAction: mocks.analyze,
  loadMoreBacklinkRowsAction: vi.fn(),
}));
vi.mock("@/lib/actions/demo-research", () => ({
  listDemoBacklinksAction: mocks.listStored,
  readDemoBacklinksAction: mocks.readStored,
}));
vi.mock("@/lib/queries/demo-research", () => ({ getDemoResearchAccess: mocks.demo }));
vi.mock("@/lib/queries/_auth", () => ({ resolveProjectAccess: mocks.resolve }));
vi.mock("@/lib/queries/backlinks", () => ({ getBacklinksPageContext: mocks.context }));
vi.mock("@/i18n/catalog-loader.server", () => ({ loadCoreMessages: mocks.messages }));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: mocks.runtime,
}));
vi.mock("@/i18n/translator.server", () => ({ createIntlTranslator: mocks.translator }));

describe("BacklinksPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolve.mockResolvedValue({ publicId: "prj_1" });
    mocks.runtime.mockResolvedValue({ locale: "en", timeZone: "UTC" });
    mocks.messages.mockResolvedValue({});
    mocks.translator.mockReturnValue(mocks.translate);
    mocks.translate.mockImplementation((key: string, values?: Record<string, string | number>) => {
      if (key === "projectResearch.demo.backToSaved") {
        return "Back to saved results";
      }
      if (key === "projectBacklinks.workspace.analyze.wholeSite") return "Whole site";
      if (key === "projectBacklinks.workspace.analyze.exactPage") return "Exact page";
      if (key === "projectResearch.demo.savedBacklinksOption") {
        return `${values?.target} - ${values?.scope}${values?.includeSubdomains === "true" ? ", subdomains" : ""}`;
      }
      return key;
    });
    mocks.demo.mockResolvedValue(null);
    mocks.context.mockResolvedValue({
      costContext: { capCents: 5_000, spentCents: 0 },
      defaultTarget: "project.example",
      providerStatus: "connected",
      recentTargets: [],
    });
    mocks.analyze.mockResolvedValue({
      cached: false,
      costCents: 5,
      estimate: true,
      estimatedCostCents: 5,
      ok: true,
    });
  });

  it("honors the target query contract from Domain Overview", async () => {
    render(
      await BacklinksPage({
        params: Promise.resolve({ project: "prj_1" }),
        searchParams: Promise.resolve({ target: " linked.example " }),
      }),
    );

    expect(screen.getByTestId("backlinks-workspace")).toBeInTheDocument();
    expect(mocks.analyze).toHaveBeenCalledWith(
      expect.objectContaining({ estimateOnly: true, target: "linked.example" }),
    );
    expect(mocks.workspace).toHaveBeenCalledWith(
      expect.objectContaining({
        initialEstimate: { cached: false, costCents: 5, loading: false, valid: true },
        initialTarget: "linked.example",
      }),
    );
  });

  it("does not price a suggested target when the page opens empty", async () => {
    render(
      await BacklinksPage({
        params: Promise.resolve({ project: "prj_1" }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByTestId("backlinks-workspace")).toBeInTheDocument();
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.workspace).toHaveBeenCalledWith(
      expect.objectContaining({ initialEstimate: undefined, initialTarget: "" }),
    );
  });

  it("keeps a Viewer on stored data when a forged management query is present", async () => {
    mocks.demo.mockResolvedValue({
      actorKind: "viewer",
      project: { id: "project_1", publicId: "prj_1" },
    });
    mocks.listStored.mockResolvedValue([
      {
        freshUntil: "2026-10-10T00:00:00.000Z",
        includeSubdomains: true,
        mode: "as_is",
        savedAt: "2026-09-10T00:00:00.000Z",
        stale: false,
        target: "saved.example",
        targetScope: "site",
      },
    ]);
    mocks.readStored.mockResolvedValue({ target: "saved.example" });
    mocks.analyze.mockRejectedValueOnce(new Error("stored mode must not estimate"));
    mocks.context.mockRejectedValueOnce(new Error("stored mode must not load provider context"));
    mocks.resolve.mockRejectedValueOnce(new Error("stored mode must not resolve normal access"));

    render(
      await BacklinksPage({
        params: Promise.resolve({ project: "prj_1" }),
        searchParams: Promise.resolve({ demoManage: "1", target: "paid.example" }),
      }),
    );

    expect(screen.getByTestId("stored-backlinks")).toBeInTheDocument();
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.messages).toHaveBeenCalledWith("en", [
      "shared",
      "projectBacklinks",
      "projectResearch",
    ]);
    expect(mocks.selector).toHaveBeenCalledWith(
      expect.objectContaining({
        options: [expect.objectContaining({ label: "saved.example - Whole site, subdomains" })],
        module: "backlinks",
      }),
    );
    expect(mocks.readStored).toHaveBeenCalledWith({
      includeSubdomains: true,
      mode: "as_is",
      projectId: "prj_1",
      target: "saved.example",
      targetScope: "site",
    });
  });
});
