import { KeywordDetailStoryThemes } from "@/components/keyword-detail/shared/story-theme-preview";
import { KeywordPendingDetail } from "@/components/keywords/KeywordPendingDetail";
import { KeywordTrafficCard } from "@/components/keywords/KeywordTrafficCard";
import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { ToastProvider } from "@/components/ui";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import type { KeywordCheckState } from "@/lib/queries/keyword-row-types";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { Meta, StoryObj } from "@storybook/react";

const costContext = {
  capCents: 5_000,
  costPerCheckCents: 2,
  cronExpression: null,
  depth: 20,
  deviceCount: 1,
  devices: ["desktop"],
  frequency: "weekly",
  keywordCount: 1,
  locationCount: 1,
  projectName: "Demo",
  providerId: "dataforseo",
  rawFrequency: "weekly",
  spentCents: 0,
} satisfies ProjectCostContext;

const actionArgs = {
  canUpdateKeyword: true,
  costContext,
  createKeywordAlertAction: async () => undefined,
  projectId: "prj_demo",
  projectRef: "prj_demo",
  runCheckNowAction: async () => undefined,
  updateKeywordAction: async () => undefined,
  updateKeywordScheduleAction: async () => undefined,
};

function pendingKeyword(state: Exclude<KeywordCheckState, "ranked">): KeywordRow {
  return {
    ...keywordRows[0],
    checkState: state,
    hasRankData: false,
    position: 101,
    positionHistory: [],
    rankingUrlHistory: [],
    tags: [],
    trackedDepth: 20 as const,
  };
}

const meta = {
  component: KeywordPendingDetail,
  decorators: [
    (Story) => (
      <KeywordDetailStoryThemes>
        <ToastProvider>
          <div className="grid max-w-4xl gap-4">
            <Story />
            <div>
              <KeywordTrafficCard
                projectRef="prj_demo"
                traffic={{
                  hasAnalyticsConnection: true,
                  hasSearchConsoleConnection: false,
                  pages: [],
                  query: null,
                }}
                trafficState="not_connected"
              />
            </div>
          </div>
        </ToastProvider>
      </KeywordDetailStoryThemes>
    ),
  ],
  parameters: {
    chromatic: { viewports: [390, 768, 1440] },
    nextjs: { appDirectory: true },
  },
  title: "Keyword detail/Rank states",
} satisfies Meta<typeof KeywordPendingDetail>;

export default meta;

type Story = StoryObj<typeof meta>;

export const NeverChecked: Story = {
  args: {
    ...actionArgs,
    keyword: pendingKeyword("never_checked"),
    providerConnected: true,
    rankState: "never_checked",
    whatChanged: "first_check",
  },
};

export const NotRanked: Story = {
  args: {
    ...actionArgs,
    keyword: pendingKeyword("not_ranked"),
    providerConnected: true,
    rankState: "not_ranked",
    whatChanged: "no_change",
  },
};

export const Failed: Story = {
  args: {
    ...actionArgs,
    keyword: pendingKeyword("failed"),
    providerConnected: true,
    rankState: "failed",
    whatChanged: "diff",
  },
};

export const Running: Story = {
  args: {
    ...actionArgs,
    keyword: pendingKeyword("running"),
    providerConnected: true,
    rankState: "running",
    whatChanged: "no_change",
  },
};
