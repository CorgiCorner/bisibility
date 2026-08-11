import { render } from "@testing-library/react";
import type { ComponentProps } from "react";
import { vi } from "vitest";
import { OnboardingWizard } from "./OnboardingWizard";

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
    addKeywordsAction: vi.fn(async () => ({ created: 0, keywords: [], skippedDuplicates: 0 })),
    completeGooglePropertySelectionAction: vi.fn(async (input) => ({ property: input.property })),
    completeOnboardingAction: vi.fn(async () => ({ completed: true })),
    connectProviderAction: vi.fn(async () => undefined),
    createProjectAction: vi.fn(async () => project),
    fetchRankedKeywordSuggestionsAction: vi.fn(async () => ({ reason: "no_source" as const })),
    getObservedPositionsAction: vi.fn(async () => []),
    importTopQueriesAction: vi.fn(async () => ({ queries: [] })),
    installSampleDataAction: vi.fn(async () => undefined),
    issueApiKeyAction: vi.fn(async () => ({
      maskedValue: "bsb_key_live_******",
      name: "Development",
      raw: "bsb_key_live_secret",
    })),
    listFirstCheckCandidatesAction: vi.fn(async () => ({
      candidates: [],
      hasAnalyticsSource: false,
      isSampleProject: false,
      providerReady: false,
    })),
    queueFirstChecksAction: vi.fn(async () => undefined),
    runFirstCheckPreviewAction: vi.fn(async () => ({
      position: null,
      provider: "dataforseo",
      rankingUrl: null,
      status: "completed" as const,
    })),
    // saveMatchingScopeAction: vi.fn(async () => undefined), // Restore with issue #863.
    syncProjectTrafficAction: vi.fn(async () => undefined),
    testProviderConnectionAction: vi.fn(async () => ({ message: "Connected", ok: true })),
    updateProjectDefaultsAction: vi.fn(async () => undefined),
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
      initialHasApiKey={false}
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
