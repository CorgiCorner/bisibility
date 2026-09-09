import { countrySeed } from "@/lib/serp/location";
import { render } from "@testing-library/react";
import type { ComponentProps } from "react";
import { vi } from "vitest";
import { OnboardingWizard } from "./OnboardingWizard";

const languageLabels: Record<string, string> = { en: "English", es: "Spanish" };

export const project = {
  domain: "example.com",
  id: "project_1",
  name: "Example",
  publicId: "prj_1",
};

type OnboardingWizardProps = ComponentProps<typeof OnboardingWizard>;
type RenderWizardProps = Omit<Partial<OnboardingWizardProps>, "actions"> & {
  actions?: Partial<OnboardingWizardProps["actions"]>;
};

export function renderWizard({ actions: actionOverrides, ...props }: RenderWizardProps = {}) {
  const actions: OnboardingWizardProps["actions"] = {
    addKeywordsAction: vi.fn(async () => ({
      created: 0,
      persistedKeywordCount: 0,
      keywords: [],
      skippedDuplicates: 0,
    })),
    completeGooglePropertySelectionAction: vi.fn(async (input) => ({ property: input.property })),
    completeOnboardingAction: vi.fn(async () => ({ completed: true })),
    connectProviderAction: vi.fn(async () => undefined),
    createMarketAction: vi.fn(async (input) => ({
      canonicalKey: input.canonicalKey,
      countryCode: input.countryCode,
      displayName: input.name || countrySeed(input.countryCode)?.displayName || input.countryCode,
      keywordCount: 0,
      kind: input.kind,
      languageCode: input.languageCode,
      languageLabel: languageLabels[input.languageCode] ?? input.languageCode,
      publicId: `pmkt_${"a".repeat(24)}`,
    })),
    createProjectAction: vi.fn(async () => project),
    deriveWebsiteAction: vi.fn(async () => ({ domain: "example.com", name: "example" })),
    fetchRankedKeywordSuggestionsAction: vi.fn(async () => ({ reason: "no_source" as const })),
    getObservedPositionsAction: vi.fn(async () => []),
    importTopQueriesAction: vi.fn(async () => ({ queries: [] })),
    installSampleDataAction: vi.fn(async () => ({ destination: "/app/prj_sample/dashboard" })),
    loadStoredGooglePropertiesAction: vi.fn(async () => ({
      properties: [],
      provider: "gsc" as const,
    })),
    listFirstCheckCandidatesAction: vi.fn(async () => ({
      candidates: [],
      hasAnalyticsSource: false,
      isSampleProject: false,
      providerReady: false,
    })),
    runFirstCheckPreviewAction: vi.fn(async () => ({
      position: null,
      recordedCostCents: 0,
      provider: "dataforseo",
      rankingUrl: null,
      status: "completed" as const,
    })),
    saveMarketsAction: vi.fn(async (input) => ({ marketKeys: input.marketKeys })),
    saveStoredGooglePropertyAction: vi.fn(async (input) => ({
      property: input.property,
      status: "saved" as const,
    })),
    // saveMatchingScopeAction: vi.fn(async () => undefined), // Restore with issue #863.
    syncProjectTrafficAction: vi.fn(async () => undefined),
    testProviderConnectionAction: vi.fn(async () => ({ message: "Connected", ok: true })),
    updateProjectDefaultsAction: vi.fn(async () => ({ nextCheckAt: null })),
    ...actionOverrides,
  };

  return render(
    <OnboardingWizard
      actions={actions}
      costPerCheckCents={null}
      dataResidencyMessage=""
      gscJustConnected={false}
      gscOAuthConfigured
      gscPropertyLabel={null}
      hasAnalyticsSource={false}
      initialFlowState={{ projectId: null, providerId: null }}
      initialKeywordCount={0}
      initialProject={null}
      initialStep={1}
      monthlyCapCents={500}
      providerConnected={false}
      {...props}
    />,
  );
}
