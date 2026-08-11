import { OnboardingNav } from "@/components/onboarding/OnboardingNav";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
import {
  type OnboardingStepNumber,
  onboardingDefaults,
} from "@/components/onboarding/onboarding-fixtures";
import { StepAddKeywords } from "@/components/onboarding/steps/StepAddKeywords";
import { StepConnectProvider } from "@/components/onboarding/steps/StepConnectProvider";
import {
  type CreateProjectFormValues,
  StepCreateProject,
} from "@/components/onboarding/steps/StepCreateProject";
import { StepDeveloperAccess } from "@/components/onboarding/steps/StepDeveloperAccess";
import { StepFirstCheck } from "@/components/onboarding/steps/StepFirstCheck";
import { StepSchedule } from "@/components/onboarding/steps/StepSchedule";
import { BrandLockup, Button } from "@/components/ui";
import { SignOutIcon as SignOut } from "@phosphor-icons/react/dist/ssr";
import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";

type StoryProps = {
  analyticsMode?: "connected" | "none";
  competitorMode?: "blank" | "filled";
  maxReachableStep?: OnboardingStepNumber;
  providerMode?: "both" | "none" | "primary";
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
      { id: "keyword_1", publicId: "kw_1", text: "rank tracker" },
      { id: "keyword_2", publicId: "kw_2", text: "seo api" },
      { id: "keyword_3", publicId: "kw_3", text: "keyword monitoring" },
    ],
    hasAnalyticsSource: false,
    isSampleProject: false,
    providerReady: true,
  }),
  queueFirstChecksAction: async () => ({ queued: 21 }),
  runFirstCheckPreviewAction: async () => ({
    position: 4,
    provider: "dataforseo",
    rankingUrl: "https://acme.dev/rank-tracker",
    status: "completed" as const,
  }),
};
const storyFlowState = { projectId: onboardingDefaults.projectId };
const issueApiKeyAction = async () => ({
  maskedValue: "bsb_key_live_demo******1234",
  name: "Development",
  raw: "bsb_key_live_demo_secret_1234",
});
const createProjectWithCompetitors: CreateProjectFormValues = {
  domain: "acme.dev",
  includeSubdomains: false,
  name: "Acme",
  rootAndWww: true,
  urlPrefix: false,
};

function providerPanel(mode: StoryProps["providerMode"] = "none") {
  if (mode === "both") {
    return (
      <StepConnectProvider
        defaultValues={{ ...providerBaseDefaults, providerId: "serpapi" }}
        flowState={storyFlowState}
        initialConnections={{
          dataforseo: { balance: 12.34, primary: true },
          serpapi: { balance: 480, primary: false },
        }}
        {...providerActions}
      />
    );
  }
  if (mode === "primary") {
    return (
      <StepConnectProvider
        defaultValues={{ ...providerBaseDefaults, providerId: "serpapi" }}
        flowState={storyFlowState}
        initialConnections={{ dataforseo: { balance: 12.34, primary: true } }}
        {...providerActions}
      />
    );
  }
  return <StepConnectProvider flowState={storyFlowState} {...providerActions} />;
}

function createProjectPanel(competitorMode: StoryProps["competitorMode"]) {
  return (
    <StepCreateProject
      dataResidencyMessage={dataResidencyMessage}
      defaultValues={competitorMode === "filled" ? createProjectWithCompetitors : undefined}
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
    2: (
      <StepDeveloperAccess
        issueApiKeyAction={issueApiKeyAction}
        projectId={onboardingDefaults.projectId}
      />
    ),
    3: providerPanel(providerMode),
    4: <StepSchedule flowState={storyFlowState} />,
    5: (
      <StepAddKeywords
        costPerCheckCents={1.55}
        flowState={storyFlowState}
        hasAnalyticsSource={analyticsMode === "connected"}
        importTopQueriesAction={importTopQueriesAction}
        monthlyCapCents={5_000}
      />
    ),
    6: (
      <StepFirstCheck
        flowState={{ projectId: onboardingDefaults.projectId, providerId: "dataforseo" }}
        keywordCount={24}
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
            <span className="text-fg-muted">&middot;</span>
            <span className="text-fg-muted">Not you?</span>
            <Button
              size="xs"
              startIcon={<SignOut aria-hidden size={13} weight="bold" />}
              sx={{ color: "var(--accent-text)", minHeight: 0, minWidth: 0, padding: 0 }}
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
            <OnboardingNav currentStep={step} />
          </section>
        </OnboardingStepper>
      </div>
    </main>
  );
}

const meta = {
  title: "Onboarding/Wizard",
  component: OnboardingStory,
  args: { analyticsMode: "none", competitorMode: "blank", providerMode: "none", step: 1 },
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
      options: ["none", "primary", "both"],
    },
    maxReachableStep: {
      control: "inline-radio",
      options: [1, 2, 3, 4, 5, 6],
    },
    step: {
      control: "inline-radio",
      options: [1, 2, 3, 4, 5, 6],
    },
  },
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof OnboardingStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const CreateProject: Story = { args: { step: 1 } };
export const CreateProjectWithCompetitors: Story = {
  args: { competitorMode: "filled", step: 1 },
};
export const DeveloperAccess: Story = { args: { step: 2 } };
export const ConnectProvider: Story = { args: { providerMode: "none", step: 3 } };
export const LockedAfterProject: Story = {
  args: { maxReachableStep: 2, step: 2 },
};
export const ConnectProviderBackup: Story = { args: { providerMode: "primary", step: 3 } };
export const ConnectProviderBothConnected: Story = { args: { providerMode: "both", step: 3 } };
export const TrackingDefaults: Story = { args: { step: 4 } };
export const AddKeywords: Story = { args: { step: 5 } };
export const AddKeywordsWithAnalytics: Story = {
  args: { analyticsMode: "connected", step: 5 },
};
export const FirstCheck: Story = { args: { step: 6 } };
