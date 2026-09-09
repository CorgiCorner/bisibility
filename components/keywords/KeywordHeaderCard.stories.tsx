import { SessionSpendProvider } from "@/components/cost-estimate/SessionSpendProvider";
import {
  RunChecksConfirmationModal,
  type RunChecksFlow,
} from "@/components/keywords/grid/RunChecksConfirmationModal";
import { KeywordHeaderCard } from "@/components/keywords/KeywordHeaderCard";
import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { ToastProvider } from "@/components/ui/Toast";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import type { Meta, StoryObj } from "@storybook/react";
import { userEvent, within } from "storybook/test";

const keyword = keywordRows[1];
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
  timezone: "UTC",
} satisfies ProjectCostContext;
const actionArgs = {
  addKeywordsAction: async () => undefined,
  canUpdateKeyword: true,
  costContext,
  createKeywordAlertAction: async () => undefined,
  projectId: "prj_demo",
  projectMarkets: {
    markets: [
      {
        canonicalKey: keyword.location.canonicalKey,
        countryCode: "US",
        displayName: "United States",
        id: "pmkt_us",
        languageCode: "en",
        languageLabel: "English",
        keywordCount: 1,
        monthlyCostCents: 0,
        researchAvailable: true,
        status: "active" as const,
      },
    ],
    maxMarkets: 5,
    monthlyCostCents: 0,
    perMarketChecks: 1,
    projectId: "prj_demo",
  },
  runCheckNowAction: async () => undefined,
  tagSuggestions: ["Product", "Docs", "Comparison"],
  updateKeywordAction: async () => undefined,
};

function flow(step: RunChecksFlow["step"]): RunChecksFlow {
  return {
    completed: step === "success" ? 1 : 0,
    failures:
      step === "failed"
        ? [{ code: "sample_project", message: "This check could not start.", rankCheckId: null }]
        : [],
    pending: { depth: 20, keywordIds: [keyword.id] },
    rankCheckIds: step === "running" ? ["check_story"] : [],
    step,
  };
}

function HeaderWithCheckModal({ step }: Readonly<{ step: RunChecksFlow["step"] }>) {
  return (
    <>
      <KeywordHeaderCard {...actionArgs} keyword={keyword} />
      <RunChecksConfirmationModal
        flow={flow(step)}
        onClose={() => undefined}
        onConfirm={() => undefined}
        onRetry={() => undefined}
        projectId="proj_demo"
        rows={[keyword]}
      />
    </>
  );
}

const meta = {
  title: "Keywords/KeywordHeaderCard",
  component: KeywordHeaderCard,
  decorators: [
    (Story, context) => (
      <SessionSpendProvider>
        <ToastProvider>
          <div
            className="min-h-[260px] bg-bg p-5 text-fg"
            data-theme={context.parameters.theme ?? "light"}
          >
            <Story />
          </div>
        </ToastProvider>
      </SessionSpendProvider>
    ),
  ],
  parameters: {
    chromatic: { viewports: [1280, 1440] },
    nextjs: { appDirectory: true },
  },
} satisfies Meta<typeof KeywordHeaderCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { ...actionArgs, keyword } };
export const RankstateRunning: Story = {
  args: { ...actionArgs, keyword, rankState: "running" },
};
export const RankstateNeverChecked: Story = {
  args: { ...actionArgs, keyword, rankState: "never_checked" },
};
export const RankstateFailed: Story = {
  args: { ...actionArgs, keyword, rankState: "failed" },
};
export const RankstateNotRanked: Story = {
  args: { ...actionArgs, keyword, rankState: "not_ranked" },
};
export const RankstateNoData: Story = {
  args: { ...actionArgs, keyword: { ...keyword, hasRankData: false } },
};
export const CheckmodalstateConfirm: Story = {
  args: { ...actionArgs, keyword },
  render: () => <HeaderWithCheckModal step="confirm" />,
};
export const CheckmodalstateRunning: Story = {
  args: { ...actionArgs, keyword },
  render: () => <HeaderWithCheckModal step="running" />,
};
export const CheckmodalstateSuccess: Story = {
  args: { ...actionArgs, keyword },
  render: () => <HeaderWithCheckModal step="success" />,
};
export const CheckmodalstateFailed: Story = {
  args: { ...actionArgs, keyword },
  render: () => <HeaderWithCheckModal step="failed" />,
};

export const MoremenuopenTrue: Story = {
  args: { ...actionArgs, keyword },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "More keyword actions" }),
    );
  },
};

export const ThemeDark: Story = {
  args: { ...actionArgs, keyword },
  parameters: { theme: "dark" },
};

export const EditKeyword: Story = {
  args: { ...actionArgs, keyword },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "More keyword actions" }),
    );
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("menuitem", { name: "Edit" }),
    );
  },
};
