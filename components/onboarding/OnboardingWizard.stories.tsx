import { OnboardingNav } from "@/components/onboarding/OnboardingNav";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
import {
  type OnboardingStepNumber,
  onboardingDefaults,
} from "@/components/onboarding/onboarding-fixtures";
import {
  fetchRankedKeywordSuggestionsAction,
  rankedKeywordConnection,
} from "@/components/onboarding/onboarding-story-fixtures";
import { StepAddKeywords } from "@/components/onboarding/steps/StepAddKeywords";
import { StepConnectGscCard } from "@/components/onboarding/steps/StepConnectGscCard";
import { StepConnectProvider } from "@/components/onboarding/steps/StepConnectProvider";
import {
  type CreateProjectFormValues,
  StepCreateProject,
} from "@/components/onboarding/steps/StepCreateProject";
import { StepFirstCheck } from "@/components/onboarding/steps/StepFirstCheck";
import { BrandLockup, Button } from "@/components/ui";
import { SignOutIcon as SignOut } from "@phosphor-icons/react/dist/ssr";
import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";

type StoryProps = {
  analyticsMode?: "connected" | "none";
  competitorMode?: "blank" | "filled";
  maxReachableStep?: OnboardingStepNumber;
  providerMode?: "both" | "connected" | "none";
  step: OnboardingStepNumber;
};

const dataResidencyMessage = "Your data is stored and processed in the EU.";
const providerBaseDefaults = {
  login: "",
  projectId: onboardingDefaults.projectId,
  providerId: "dataforseo" as const,
  secret: "",
};
const providerActions = {
  connectProviderAction: async () => undefined,
  testProviderConnectionAction: async () => ({
    balance: 12.34,
    message: "Connected",
    ok: true,
  }),
};
const importTopQueriesAction = async () => ({
  queries: ["rank tracker", "seo api", "keyword monitoring"],
});
const firstCheckActions = {
  getObservedPositionsAction: async () => [],
  listFirstCheckCandidatesAction: async () => ({
    candidates: [
      {
        device: "desktop" as const,
        id: "keyword_1",
        market: { languageLabel: "English", locationLabel: "United States" },
        publicId: "kw_1",
        text: "rank tracker",
      },
      {
        device: "mobile" as const,
        id: "keyword_2",
        market: { languageLabel: "English", locationLabel: "United States" },
        publicId: "kw_2",
        text: "rank tracker",
      },
    ],
    hasAnalyticsSource: false,
    isSampleProject: false,
    providerReady: true,
  }),
  runFirstCheckPreviewAction: async () => ({
    position: 4,
    provider: "dataforseo",
    rankingUrl: "https://acme.dev/rank-tracker",
    status: "completed" as const,
  }),
};
const storyFlowState = { projectId: onboardingDefaults.projectId };
const createProjectWithCompetitors: CreateProjectFormValues = {
  website: "acme.dev",
};

function providerPanel(mode: StoryProps["providerMode"] = "none") {
  const analyticsOption = (
    <StepConnectGscCard configured projectId={onboardingDefaults.projectId} />
  );
  if (mode === "both") {
    return (
      <StepConnectProvider
        analyticsOption={analyticsOption}
        defaultValues={{ ...providerBaseDefaults, providerId: "serpapi" }}
        flowState={storyFlowState}
        initialConnections={{
          dataforseo: { balance: 12.34 },
          serpapi: { balance: 480 },
        }}
        {...providerActions}
      />
    );
  }
  if (mode === "connected") {
    return (
      <StepConnectProvider
        analyticsOption={analyticsOption}
        defaultValues={{ ...providerBaseDefaults, providerId: "serpapi" }}
        flowState={storyFlowState}
        initialConnections={{ dataforseo: { balance: 12.34 } }}
        {...providerActions}
      />
    );
  }
  return (
    <StepConnectProvider
      analyticsOption={analyticsOption}
      flowState={storyFlowState}
      {...providerActions}
    />
  );
}

function createProjectPanel(competitorMode: StoryProps["competitorMode"]) {
  return (
    <StepCreateProject
      dataResidencyMessage={dataResidencyMessage}
      defaultValues={competitorMode === "filled" ? createProjectWithCompetitors : undefined}
      deriveWebsiteAction={async () => ({ domain: "acme.dev", name: "acme" })}
    />
  );
}

function panelForStep(
  step: OnboardingStepNumber,
  providerMode: StoryProps["providerMode"],
  competitorMode: StoryProps["competitorMode"],
  analyticsMode: StoryProps["analyticsMode"],
) {
  const panelByStep: Record<OnboardingStepNumber, ReactNode> = {
    1: createProjectPanel(competitorMode),
    2: providerPanel(providerMode),
    3: (
      <StepAddKeywords
        costPerCheckCents={1.55}
        flowState={
          providerMode === "connected"
            ? { ...storyFlowState, providerId: "dataforseo" }
            : storyFlowState
        }
        hasAnalyticsSource={analyticsMode === "connected"}
        importTopQueriesAction={importTopQueriesAction}
        monthlyCapCents={5_000}
        fetchRankedKeywordSuggestionsAction={fetchRankedKeywordSuggestionsAction}
        projectDomain="acme.dev"
        rankedKeywordConnections={providerMode === "connected" ? [rankedKeywordConnection] : []}
      />
    ),
    4: (
      <StepFirstCheck
        defaults={{
          city: null,
          country: "United States",
          cronExpression: "0 6 * * *",
          device: "desktop",
          devices: ["desktop", "mobile"],
          frequency: "daily",
          jitterMinutes: 60,
          locationKey: "US",
          locationSelections: [
            {
              canonicalKey: "US",
              countryCode: "US",
              displayName: "United States",
              kind: "country",
              languageCode: "en",
              languageLabel: "English",
            },
          ],
          locations: ["US"],
          projectId: onboardingDefaults.projectId,
          serpDepth: 100,
          timezone: "America/New_York",
        }}
        flowState={{
          projectId: onboardingDefaults.projectId,
          providerId: "dataforseo",
        }}
        keywordCount={24}
        keywordDraft={"rank tracker\nseo api\nkeyword monitoring"}
        project={{ domain: "acme.dev", name: "Acme", publicId: onboardingDefaults.projectId }}
        providerConnected
        {...firstCheckActions}
      />
    ),
  };
  return panelByStep[step];
}

function OnboardingStory({
  analyticsMode = "none",
  competitorMode = "blank",
  maxReachableStep,
  providerMode = "none",
  step,
}: StoryProps) {
  return (
    <main className="min-h-dvh bg-bg px-4 py-[46px] pb-24 text-fg sm:px-6">
      <div className="mx-auto w-full max-w-[940px]">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <BrandLockup />
          <div className="inline-flex items-center gap-2 text-[12.5px] text-fg-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="grid h-[22px] w-[22px] place-items-center rounded-md bg-accent-solid font-mono text-[9px] font-semibold text-white">
                AK
              </span>
              demo@acme.dev
            </span>
            <span aria-hidden className="h-4 w-px bg-border-strong" />
            <span className="text-fg-muted">Not you?</span>
            <Button
              size="xs"
              startIcon={<SignOut aria-hidden size={13} weight="bold" />}
              sx={{
                color: "var(--accent-text)",
                minWidth: 0,
                paddingX: "8px",
              }}
              type="button"
              variant="ghost"
            >
              Log out
            </Button>
          </div>
        </header>
        <section className="mt-6 max-w-xl">
          <h1 className="m-0 text-[30px] font-semibold leading-tight tracking-[-1px]">
            Set up your project
          </h1>
          <p className="m-0 mt-2 text-[15px] leading-[1.5] text-fg-muted">
            A few quick steps - everything can be changed later.
          </p>
        </section>
        <OnboardingStepper currentStep={step} maxReachableStep={maxReachableStep}>
          <section className="rounded-2xl border border-border bg-bg-elev p-6 sm:px-7 sm:py-[26px]">
            {panelForStep(step, providerMode, competitorMode, analyticsMode)}
            {step === 4 ? null : <OnboardingNav currentStep={step} />}
          </section>
        </OnboardingStepper>
      </div>
    </main>
  );
}

const meta = {
  title: "Onboarding/Wizard",
  component: OnboardingStory,
  args: {
    analyticsMode: "none",
    competitorMode: "blank",
    providerMode: "none",
    step: 1,
  },
  argTypes: {
    analyticsMode: {
      control: "inline-radio",
      options: ["none", "connected"],
    },
    competitorMode: {
      control: "inline-radio",
      options: ["blank", "filled"],
    },
    providerMode: {
      control: "inline-radio",
      options: ["none", "connected", "both"],
    },
    maxReachableStep: {
      control: "inline-radio",
      options: [1, 2, 3, 4],
    },
    step: {
      control: "inline-radio",
      options: [1, 2, 3, 4],
    },
  },
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true },
  },
} satisfies Meta<typeof OnboardingStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const CreateProject: Story = { args: { step: 1 } };
export const CreateProjectWithCompetitors: Story = {
  args: { competitorMode: "filled", step: 1 },
};
export const ConnectProvider: Story = {
  args: { providerMode: "none", step: 2 },
};
export const LockedAfterProject: Story = {
  args: { maxReachableStep: 2, step: 2 },
};
export const ConnectProviderAdditional: Story = {
  args: { providerMode: "connected", step: 2 },
};
export const ConnectProviderBothConnected: Story = {
  args: { providerMode: "both", step: 2 },
};
export const AddKeywords: Story = { args: { step: 3 } };
export const AddKeywordsWithAnalytics: Story = {
  args: { analyticsMode: "connected", step: 3 },
};
export const AddKeywordsWithSources: Story = {
  args: { analyticsMode: "connected", providerMode: "connected", step: 3 },
};
export const FirstCheck: Story = { args: { step: 4 } };
