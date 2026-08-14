import { redirect } from "@/tests/next-navigation";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OnboardingPage from "./page";

const mocks = vi.hoisted(() => ({
  existingOnboardingCityLocationKeys: vi.fn(),
  getIntegrationCategories: vi.fn(),
  getKeywordCount: vi.fn(),
  getOnboardingProjectMarketKeys: vi.fn(),
  getProjectCostContext: vi.fn(),
  getRequestProjectDefaults: vi.fn(),
  isCloud: true,
  listWorkspaces: vi.fn(),
  completeProjectOnboarding: vi.fn(),
  prisma: {
    apiKey: { findFirst: vi.fn() },
    providerConnection: { findUnique: vi.fn() },
  },
  requireReadableProject: vi.fn(),
  listEligibleRankedKeywordConnections: vi.fn(),
  wizard: vi.fn((_props: unknown) => null),
}));

vi.mock("@/components/onboarding/OnboardingWizard", () => ({
  OnboardingWizard: (props: unknown) => mocks.wizard(props),
}));
vi.mock("@/lib/actions/competitors", () => ({ addManagedCompetitor: vi.fn() }));
vi.mock("@/lib/actions/keyword", () => ({ addKeywordsMatrix: vi.fn() }));
vi.mock("@/lib/actions/keyword-suggest", () => ({ importTopQueries: vi.fn() }));
vi.mock("@/lib/actions/project", () => ({
  completeProjectOnboarding: mocks.completeProjectOnboarding,
}));
vi.mock("@/lib/actions/providers", () => ({
  completeGooglePropertySelection: vi.fn(),
  connectProvider: vi.fn(),
  loadStoredGoogleProperties: vi.fn(),
  saveStoredGoogleProperty: vi.fn(),
  testConnection: vi.fn(),
}));
vi.mock("@/lib/actions/settings", () => ({ updateDefaultRankCheckSettings: vi.fn() }));
vi.mock("@/lib/actions/traffic-sync", () => ({ syncProjectTraffic: vi.fn() }));
vi.mock("@/lib/deployment/deployment", () => ({
  dataResidencyMessage: () => "EU data residency",
  get isCloud() {
    return mocks.isCloud;
  },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/analytics/google-client", () => ({
  isGoogleOAuthConfigured: () => true,
}));
vi.mock("@/lib/providers/crypto", () => ({
  decryptProviderCredentials: () => ({ login: "sc-domain:example.com" }),
}));
vi.mock("@/lib/queries/_auth", () => ({
  requireReadableProject: mocks.requireReadableProject,
}));
vi.mock("@/lib/queries/cost-calculator", () => ({
  getProjectCostContext: mocks.getProjectCostContext,
}));
vi.mock("@/lib/queries/integrations", () => ({
  getIntegrationCategories: mocks.getIntegrationCategories,
}));
vi.mock("@/lib/queries/onboarding", () => ({
  existingOnboardingCityLocationKeys: mocks.existingOnboardingCityLocationKeys,
  getOnboardingGscPropertyLabel: vi.fn(async () => null),
  getOnboardingKeywordCount: mocks.getKeywordCount,
  getOnboardingProjectMarketKeys: mocks.getOnboardingProjectMarketKeys,
}));
vi.mock("@/lib/queries/workspaces", () => ({ listWorkspaces: mocks.listWorkspaces }));
vi.mock("@/lib/queries/workspace-request-data", () => ({
  getRequestProjectDefaults: mocks.getRequestProjectDefaults,
}));
vi.mock("@/lib/rank-check/budget", () => ({ DEFAULT_MONTHLY_COST_CAP_CENTS: 5_000 }));
vi.mock("@/lib/ranked-keywords/service", () => ({
  listEligibleRankedKeywordConnections: mocks.listEligibleRankedKeywordConnections,
}));
vi.mock("./actions", () => ({
  createOnboardingProject: vi.fn(),
  deriveOnboardingWebsite: vi.fn(),
  saveOnboardingMarkets: vi.fn(),
}));

const project = {
  budgetCapCents: 5_000,
  domain: "example.com",
  id: "project_1",
  name: "Example",
  publicId: "prj_1",
};

describe("OnboardingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redirect.mockImplementation((href: string) => {
      throw new Error(`redirect:${href}`);
    });
    mocks.isCloud = true;
    mocks.listWorkspaces.mockResolvedValue([{ publicId: "prj_1" }]);
    mocks.requireReadableProject.mockResolvedValue({ project });
    mocks.getIntegrationCategories.mockResolvedValue([]);
    mocks.getProjectCostContext.mockResolvedValue({ costPerCheckCents: null });
    mocks.existingOnboardingCityLocationKeys.mockResolvedValue(new Set<string>());
    mocks.getOnboardingProjectMarketKeys.mockResolvedValue([]);
    mocks.getRequestProjectDefaults.mockResolvedValue(null);
    mocks.prisma.apiKey.findFirst.mockResolvedValue(null);
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(null);
    mocks.listEligibleRankedKeywordConnections.mockResolvedValue([]);
  });

  it("resolves the actor's first project by public id when the URL has no project", async () => {
    mocks.getKeywordCount.mockResolvedValue(2);

    await expect(
      OnboardingPage({
        searchParams: Promise.resolve({ step: "4" }),
      }),
    ).resolves.toBeTruthy();

    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
  });

  it("starts at step 1 for a fresh project even when the actor already has one", async () => {
    const page = await OnboardingPage({
      searchParams: Promise.resolve({ new: "1" }),
    });
    render(page);

    expect(redirect).not.toHaveBeenCalled();
    expect(mocks.requireReadableProject).not.toHaveBeenCalled();
    expect(mocks.wizard).toHaveBeenCalledWith(
      expect.objectContaining({
        initialFlowState: expect.objectContaining({ locations: ["US"] }),
        initialProject: null,
        initialStep: 1,
      }),
    );
    expect(mocks.getOnboardingProjectMarketKeys).not.toHaveBeenCalled();
  });

  it("hydrates resumed market defaults from the active and paused registry", async () => {
    mocks.getKeywordCount.mockResolvedValue(2);
    mocks.getOnboardingProjectMarketKeys.mockResolvedValue(["US", "ES@en"]);

    const page = await OnboardingPage({
      searchParams: Promise.resolve({ projectId: "prj_1", step: "4" }),
    });
    render(page);

    expect(mocks.getOnboardingProjectMarketKeys).toHaveBeenCalledWith("prj_1");
    expect(mocks.wizard).toHaveBeenCalledWith(
      expect.objectContaining({
        initialFlowState: expect.objectContaining({ locations: ["US", "ES@en"] }),
      }),
    );
  });

  it("keeps explicit draft locations instead of replacing them from the registry", async () => {
    mocks.getKeywordCount.mockResolvedValue(2);
    mocks.getOnboardingProjectMarketKeys.mockResolvedValue(["US", "ES@en"]);

    const page = await OnboardingPage({
      searchParams: Promise.resolve({ loc: "PL", projectId: "prj_1", step: "4" }),
    });
    render(page);

    expect(mocks.getOnboardingProjectMarketKeys).not.toHaveBeenCalled();
    expect(mocks.wizard).toHaveBeenCalledWith(
      expect.objectContaining({
        initialFlowState: expect.objectContaining({ locations: ["PL"] }),
      }),
    );
  });

  it("hydrates the registry when every explicit location parameter is invalid", async () => {
    mocks.getKeywordCount.mockResolvedValue(2);
    mocks.getOnboardingProjectMarketKeys.mockResolvedValue(["US", "ES@en"]);

    const page = await OnboardingPage({
      searchParams: Promise.resolve({
        country: "Atlantis",
        loc: ["invalid", "not/a/key"],
        projectId: "prj_1",
        step: "4",
      }),
    });
    render(page);

    expect(mocks.getOnboardingProjectMarketKeys).toHaveBeenCalledWith("prj_1");
    expect(mocks.wizard).toHaveBeenCalledWith(
      expect.objectContaining({
        initialFlowState: expect.objectContaining({ locations: ["US", "ES@en"] }),
      }),
    );
  });

  it("hydrates the registry when the only explicit city does not exist", async () => {
    mocks.getKeywordCount.mockResolvedValue(2);
    mocks.getOnboardingProjectMarketKeys.mockResolvedValue(["PL"]);

    const page = await OnboardingPage({
      searchParams: Promise.resolve({
        loc: "US/Nowhere",
        projectId: "prj_1",
        step: "4",
      }),
    });
    render(page);

    expect(mocks.existingOnboardingCityLocationKeys).toHaveBeenCalledWith(["US/Nowhere"]);
    expect(mocks.getOnboardingProjectMarketKeys).toHaveBeenCalledWith("prj_1");
    expect(mocks.wizard).toHaveBeenCalledWith(
      expect.objectContaining({
        initialFlowState: expect.objectContaining({ locations: ["PL"] }),
      }),
    );
  });

  it("clamps final-step URL entry to add-keywords when the project has no keywords", async () => {
    mocks.getKeywordCount.mockResolvedValue(0);

    await expect(
      OnboardingPage({
        searchParams: Promise.resolve({ projectId: "prj_1", step: "4" }),
      }),
    ).rejects.toThrow("redirect:/onboarding?step=3");

    expect(redirect).toHaveBeenCalledWith(
      "/onboarding?step=3&projectId=prj_1&loc=US&device=desktop",
    );
  });

  it("normalizes loc keys, verifies city rows, and keeps country as a legacy alias", async () => {
    mocks.getKeywordCount.mockResolvedValue(0);
    mocks.existingOnboardingCityLocationKeys.mockResolvedValue(new Set(["US/Texas/Austin"]));

    await expect(
      OnboardingPage({
        searchParams: Promise.resolve({
          country: "Poland",
          loc: ["US/Texas/Austin", "US/Nowhere"],
          projectId: "prj_1",
          step: "4",
        }),
      }),
    ).rejects.toThrow("redirect:/onboarding?step=3");

    expect(redirect).toHaveBeenCalledWith(
      "/onboarding?step=3&projectId=prj_1&loc=US%2FTexas%2FAustin&loc=PL&device=desktop",
    );
  });

  it("allows providerless final-step URL entry once keywords exist", async () => {
    mocks.getKeywordCount.mockResolvedValue(2);

    await expect(
      OnboardingPage({
        searchParams: Promise.resolve({ projectId: "prj_1", step: "4" }),
      }),
    ).resolves.toBeTruthy();

    expect(redirect).not.toHaveBeenCalled();
  });

  it("loads persisted project timezone into initialProject on resume", async () => {
    mocks.getKeywordCount.mockResolvedValue(2);
    mocks.getRequestProjectDefaults.mockResolvedValue({ timezone: "Europe/Madrid" });

    const page = await OnboardingPage({
      searchParams: Promise.resolve({ projectId: "prj_1", step: "4" }),
    });
    render(page);

    expect(mocks.wizard).toHaveBeenCalledWith(
      expect.objectContaining({
        initialProject: expect.not.objectContaining({ defaults: expect.anything() }),
      }),
    );
    expect(mocks.wizard.mock.calls.at(-1)?.[0]).toMatchObject({
      initialProject: { timezone: "Europe/Madrid" },
    });
  });

  it("falls back to UTC for initialProject.timezone when the project has no defaults", async () => {
    mocks.getKeywordCount.mockResolvedValue(2);
    mocks.getRequestProjectDefaults.mockResolvedValue(null);

    const page = await OnboardingPage({
      searchParams: Promise.resolve({ projectId: "prj_1", step: "4" }),
    });
    render(page);

    expect(mocks.wizard).toHaveBeenCalledWith(
      expect.objectContaining({
        initialProject: expect.objectContaining({ timezone: "UTC" }),
      }),
    );
  });

  it("passes only public ranked-keyword connection IDs to the wizard", async () => {
    mocks.getKeywordCount.mockResolvedValue(2);
    mocks.listEligibleRankedKeywordConnections.mockResolvedValue([
      {
        id: "conn_a00000000000000000000000",
        label: "DataForSEO",
        provider: "dataforseo",
      },
    ]);

    const page = await OnboardingPage({
      searchParams: Promise.resolve({ projectId: "prj_1", step: "4" }),
    });
    render(page);

    expect(mocks.wizard).toHaveBeenCalledWith(
      expect.objectContaining({
        rankedKeywordConnections: [
          expect.objectContaining({ id: "conn_a00000000000000000000000" }),
        ],
        isCloud: true,
      }),
    );
  });

  it.each(["connection_1", "key_a00000000000000000000000"])(
    "fails closed for ranked-keyword connection ID %s",
    async (id) => {
      mocks.getKeywordCount.mockResolvedValue(2);
      mocks.listEligibleRankedKeywordConnections.mockResolvedValue([
        { id, label: "DataForSEO", provider: "dataforseo" },
      ]);

      await expect(
        OnboardingPage({
          searchParams: Promise.resolve({ projectId: "prj_1", step: "4" }),
        }),
      ).rejects.toMatchObject({ code: "invalid_public_id" });
      expect(mocks.wizard).not.toHaveBeenCalled();
    },
  );
});
