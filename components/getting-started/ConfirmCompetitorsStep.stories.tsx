import {
  type CompetitorSetupActions,
  ConfirmCompetitorsStep,
} from "@/components/getting-started/ConfirmCompetitorsStep";
import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { GettingStartedChecklist } from "./GettingStartedChecklist";

const actions: CompetitorSetupActions = {
  addManualCompetitor: async () => undefined,
  confirmSuggestedCompetitor: async () => undefined,
  dismissCompetitorSuggestion: async () => undefined,
  skipCompetitorSetup: async () => ({ outcome: "skipped" }),
};

const withFrame: Decorator = (Story, context) => (
  <div
    className={
      context.parameters.checklistLayout
        ? "mx-auto max-w-[1200px] p-5"
        : "w-[560px] max-w-full rounded-card border border-border bg-bg-elev p-5"
    }
  >
    <Story />
  </div>
);

const meta = {
  component: ConfirmCompetitorsStep,
  decorators: [withFrame],
  parameters: { chromatic: { viewports: [1024] }, nextjs: { appDirectory: true } },
  title: "Getting started/Confirm competitors",
} satisfies Meta<typeof ConfirmCompetitorsStep>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Blocked: Story = {
  args: {
    actions,
    projectId: "prj_abcdefghijklmnopqrstuvwx",
    state: {
      family: "blocked",
      reason: "Needs first check results",
      unblockedBy: "first_check",
    },
    suggestions: [],
  },
};

export const Ready: Story = {
  args: {
    actions,
    projectId: "prj_abcdefghijklmnopqrstuvwx",
    state: { family: "ready" },
    suggestions: [
      { bestPosition: 3, domain: "first.example.org", of: 12, seenOn: 9 },
      { bestPosition: 7, domain: "second.example.org", of: 12, seenOn: 5 },
    ],
  },
};

export const Skipped: Story = {
  args: {
    actions,
    projectId: "prj_abcdefghijklmnopqrstuvwx",
    state: { family: "skipped" },
    suggestions: [],
  },
};

export const NoSuggestions: Story = {
  args: { ...Ready.args, suggestions: [] },
};

export const ManySuggestions: Story = {
  args: {
    ...Ready.args,
    suggestions: Array.from({ length: 20 }, (_, index) => ({
      bestPosition: index + 1,
      domain: `competitor-${index + 1}.example.org`,
      of: 24,
      seenOn: 20 - index,
    })),
  },
};

export const ChecklistEmpty: Story = {
  args: NoSuggestions.args,
  parameters: { checklistLayout: true, layout: "fullscreen" },
  render: (args) => (
    <GettingStartedChecklist
      competitorActions={args.actions}
      context={{
        completedCheckCount: 1,
        competitorSetupOutcome: null,
        competitorSuggestions: args.suggestions,
        inFlightBatch: null,
        keywordCount: 12,
        keywordIds: ["kw_abcdefghijklmnopqrstuvwx"],
        project: {
          exists: true,
          name: "Example project",
          publicRef: "prj_abcdefghijklmnopqrstuvwx",
        },
        providerExists: true,
        schedule: { mode: "manual" },
      }}
      now={new Date("2026-09-07T00:00:00Z")}
      onCta={() => undefined}
    />
  ),
};

export const ChecklistWithSuggestions: Story = {
  ...ChecklistEmpty,
  args: ManySuggestions.args,
};
