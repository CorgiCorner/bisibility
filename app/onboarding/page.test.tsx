import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OnboardingPage from "./page";

const mocks = vi.hoisted(() => ({
  getIntegrationCategories: vi.fn(),
  getKeywordCount: vi.fn(),
  getProjectCostContext: vi.fn(),
  listWorkspaces: vi.fn(),
  prisma: {
    apiKey: { findFirst: vi.fn() },
    location: { findMany: vi.fn() },
    providerConnection: { findUnique: vi.fn() },
  },
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
  requireReadableProject: vi.fn(),
  listEligibleRankedKeywordConnections: vi.fn(),
  wizard: vi.fn((_props: unknown) => null),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/components/onboarding/OnboardingWizard", () => ({
  OnboardingWizard: (props: unknown) => mocks.wizard(props),
}));
vi.mock("@/lib/actions/competitors", () => ({ addManagedCompetitor: vi.fn() }));
vi.mock("@/lib/actions/apiKey", () => ({ issueApiKey: vi.fn() }));
vi.mock("@/lib/actions/keyword", () => ({ addKeywordsMatrix: vi.fn() }));
vi.mock("@/lib/actions/keyword-suggest", () => ({ importTopQueries: vi.fn() }));
vi.mock("@/lib/actions/providers", () => ({
  completeGooglePropertySelection: vi.fn(),
  connectProvider: vi.fn(),
  testConnection: vi.fn(),
}));
vi.mock("@/lib/actions/rankCheck", () => ({ queueFirstChecks: vi.fn() }));
vi.mock("@/lib/actions/settings", () => ({ updateDefaultRankCheckSettings: vi.fn() }));
vi.mock("@/lib/actions/traffic-sync", () => ({ syncProjectTraffic: vi.fn() }));
vi.mock("@/lib/deployment/deployment", () => ({ dataResidencyMessage: () => "EU data residency" }));
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
vi.mock("@/lib/queries/keywords", () => ({ getKeywordCount: mocks.getKeywordCount }));
vi.mock("@/lib/queries/workspaces", () => ({ listWorkspaces: mocks.listWorkspaces }));
vi.mock("@/lib/rank-check/budget", () => ({ DEFAULT_MONTHLY_COST_CAP_CENTS: 5_000 }));
vi.mock("@/lib/ranked-keywords/service", () => ({
  listEligibleRankedKeywordConnections: mocks.listEligibleRankedKeywordConnections,
}));
vi.mock("./actions", () => ({
  createOnboardingProject: vi.fn(),
  saveMatchingScope: vi.fn(),
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
    mocks.listWorkspaces.mockResolvedValue([{ publicId: "prj_1" }]);
    mocks.requireReadableProject.mockResolvedValue({ project });
    mocks.getIntegrationCategories.mockResolvedValue([]);
    mocks.getProjectCostContext.mockResolvedValue({ costPerCheckCents: null });
    mocks.prisma.location.findMany.mockResolvedValue([]);
    mocks.prisma.apiKey.findFirst.mockResolvedValue(null);
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(null);
    mocks.listEligibleRankedKeywordConnections.mockResolvedValue([]);
  });

  it("resolves the actor's first workspace by public id when the URL has no project", async () => {
    mocks.getKeywordCount.mockResolvedValue(2);

    await expect(
      OnboardingPage({
        searchParams: Promise.resolve({ step: "6" }),
      }),
    ).resolves.toBeTruthy();

    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
  });

  it("clamps final-step URL entry to add-keywords when the project has no keywords", async () => {
    mocks.getKeywordCount.mockResolvedValue(0);

    await expect(
      OnboardingPage({
        searchParams: Promise.resolve({ projectId: "prj_1", step: "6" }),
      }),
    ).rejects.toThrow("redirect:/onboarding?step=5");

    expect(mocks.redirect).toHaveBeenCalledWith(
      "/onboarding?step=5&projectId=prj_1&loc=US&device=desktop",
    );
  });

  it("normalizes loc keys, verifies city rows, and keeps country as a legacy alias", async () => {
    mocks.getKeywordCount.mockResolvedValue(0);
    mocks.prisma.location.findMany.mockResolvedValue([{ canonicalKey: "US/Texas/Austin" }]);

    await expect(
      OnboardingPage({
        searchParams: Promise.resolve({
          country: "Poland",
          loc: ["US/Texas/Austin", "US/Nowhere"],
          projectId: "prj_1",
          step: "6",
        }),
      }),
    ).rejects.toThrow("redirect:/onboarding?step=5");

    expect(mocks.redirect).toHaveBeenCalledWith(
      "/onboarding?step=5&projectId=prj_1&loc=US%2FTexas%2FAustin&loc=PL&device=desktop",
    );
  });

  it("allows providerless final-step URL entry once keywords exist", async () => {
    mocks.getKeywordCount.mockResolvedValue(2);

    await expect(
      OnboardingPage({
        searchParams: Promise.resolve({ projectId: "prj_1", step: "6" }),
      }),
    ).resolves.toBeTruthy();

    expect(mocks.redirect).not.toHaveBeenCalled();
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
      searchParams: Promise.resolve({ projectId: "prj_1", step: "6" }),
    });
    render(page);

    expect(mocks.wizard).toHaveBeenCalledWith(
      expect.objectContaining({
        rankedKeywordConnections: [
          expect.objectContaining({ id: "conn_a00000000000000000000000" }),
        ],
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
          searchParams: Promise.resolve({ projectId: "prj_1", step: "6" }),
        }),
      ).rejects.toMatchObject({ code: "invalid_public_id" });
      expect(mocks.wizard).not.toHaveBeenCalled();
    },
  );
});
