import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DomainOverviewPage from "./page";

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  context: vi.fn(),
  demo: vi.fn(),
  listStored: vi.fn(),
  readStored: vi.fn(),
  resolve: vi.fn(),
  workspace: vi.fn(),
}));

vi.mock("@/components/domain-overview/DomainOverviewWorkspace", () => ({
  DomainOverviewWorkspace: (props: unknown) => {
    mocks.workspace(props);
    return <div data-testid="domain-overview-workspace" />;
  },
}));
vi.mock("@/components/demo-research/StoredDomainOverviewView", () => ({
  StoredDomainOverviewView: () => <div data-testid="stored-domain-overview" />,
}));
vi.mock("@/components/demo-research/StoredResultSelector", () => ({
  StoredResultSelector: () => <div data-testid="stored-selector" />,
}));
vi.mock("@/components/shell/PageContent", () => ({
  PageContent: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/lib/actions/domain-overview", () => ({
  analyzeDomainOverviewAction: mocks.analyze,
  loadDomainHistoryAction: vi.fn(),
  loadDomainKeywordsPageAction: vi.fn(),
  loadDomainPagesPageAction: vi.fn(),
  saveSelectedKeywordsAction: vi.fn(),
}));
vi.mock("@/lib/actions/demo-research", () => ({
  listDemoDomainOverviewsAction: mocks.listStored,
  readDemoDomainOverviewAction: mocks.readStored,
}));
vi.mock("@/lib/queries/demo-research", () => ({ getDemoResearchAccess: mocks.demo }));
vi.mock("@/lib/queries/_auth", () => ({ resolveProjectAccess: mocks.resolve }));
vi.mock("@/lib/queries/domain-overview", () => ({
  getDomainOverviewPageContext: mocks.context,
}));

const defaultScope = {
  countryCode: "US",
  countryName: "United States",
  languageCode: "en",
  languageLabel: "English",
  providerLocationCode: 2840,
  researchAvailable: true,
};
const unitedKingdomScope = {
  countryCode: "GB",
  countryName: "United Kingdom",
  languageCode: "en",
  languageLabel: "English",
  providerLocationCode: 2826,
  researchAvailable: true,
};

describe("DomainOverviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolve.mockResolvedValue({ publicId: "prj_1" });
    mocks.demo.mockResolvedValue(null);
    mocks.context.mockResolvedValue({
      catalogScopes: [],
      competitorDomains: [],
      costContext: { capCents: 5000, spentCents: 0 },
      defaultScope,
      defaultTarget: "example.com",
      providerStatus: "connected",
      recentTargets: [],
      trackedScopes: [unitedKingdomScope],
    });
  });

  it("renders idle without probing a paid provider path", async () => {
    render(
      await DomainOverviewPage({
        params: Promise.resolve({ project: "prj_1" }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(screen.getByTestId("domain-overview-workspace")).toBeInTheDocument();
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.workspace).toHaveBeenCalledWith(
      expect.objectContaining({
        initialOutcome: null,
        initialTarget: "",
        researchScope: defaultScope,
      }),
    );
  });

  it("uses the requested country-language scope for a cached report", async () => {
    mocks.analyze
      .mockResolvedValueOnce({
        cached: true,
        estimate: true,
        estimatedCostCents: 0,
        freshEstimatedCostCents: 6,
        historyEstimatedCostCents: 12,
        historyMode: "lazy",
        keywordPageEstimatedCostCents: 2,
        languageCode: "en",
        locationCode: 2826,
        ok: true,
        pagePageEstimatedCostCents: 3,
        provider: "dataforseo",
        scope: "root",
        target: "example.com",
      })
      .mockResolvedValueOnce({ costCents: 0, ok: false, reason: "snapshot_expired" })
      .mockResolvedValueOnce({
        cached: false,
        estimate: true,
        estimatedCostCents: 6,
        freshEstimatedCostCents: 6,
        historyEstimatedCostCents: 12,
        historyMode: "lazy",
        keywordPageEstimatedCostCents: 2,
        languageCode: "en",
        locationCode: 2826,
        ok: true,
        pagePageEstimatedCostCents: 3,
        provider: "dataforseo",
        scope: "root",
        target: "example.com",
      });

    render(
      await DomainOverviewPage({
        params: Promise.resolve({ project: "prj_1" }),
        searchParams: Promise.resolve({
          domain: "example.com",
          researchScope: "GB:en",
          scope: "root",
        }),
      }),
    );

    expect(mocks.analyze).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        countryCode: "GB",
        estimateOnly: true,
        languageCode: "en",
        locationCode: 2826,
      }),
    );
    expect(mocks.analyze).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ estimateOnly: false, maxCostCents: 0 }),
    );
    expect(mocks.workspace).toHaveBeenCalledWith(
      expect.objectContaining({ initialScope: "root", researchScope: unitedKingdomScope }),
    );
  });

  it("falls back to the default scope when the requested key is unavailable", async () => {
    render(
      await DomainOverviewPage({
        params: Promise.resolve({ project: "prj_1" }),
        searchParams: Promise.resolve({ researchScope: "ZZ:zz" }),
      }),
    );

    expect(mocks.workspace).toHaveBeenCalledWith(
      expect.objectContaining({ researchScope: defaultScope }),
    );
  });

  it("uses only a stored selection for a disconnected Viewer URL", async () => {
    mocks.demo.mockResolvedValue({
      actorKind: "viewer",
      project: { id: "project_1", publicId: "prj_1" },
    });
    mocks.listStored.mockResolvedValue([
      {
        freshUntil: "2026-10-10T00:00:00.000Z",
        languageCode: "en",
        locationCode: 2840,
        savedAt: "2026-09-10T00:00:00.000Z",
        scope: "root",
        stale: true,
        target: "saved.example",
      },
    ]);
    mocks.readStored.mockResolvedValue({ target: "saved.example" });
    mocks.analyze.mockRejectedValueOnce(new Error("stored mode must not estimate or analyze"));
    mocks.context.mockRejectedValueOnce(new Error("stored mode must not load provider context"));
    mocks.resolve.mockRejectedValueOnce(new Error("stored mode must not resolve normal access"));

    render(
      await DomainOverviewPage({
        params: Promise.resolve({ project: "prj_1" }),
        searchParams: Promise.resolve({ demoManage: "1", domain: "paid.example", scope: "root" }),
      }),
    );

    expect(screen.getByTestId("stored-domain-overview")).toBeInTheDocument();
    expect(mocks.readStored).toHaveBeenCalledWith({
      languageCode: "en",
      locationCode: 2840,
      projectId: "prj_1",
      scope: "root",
      target: "saved.example",
    });
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.context).not.toHaveBeenCalled();
  });
});
