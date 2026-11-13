import { DateDisplayProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { EMPTY_TRACKING_ENGINE_PRICES } from "@/lib/ai-tracking/tracking-engines";
import trackingMessages from "@/messages/core/en/project-ai-tracking.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { AiVisibilityPromptsView } from "./AiVisibilityPromptsView";
import {
  promptsAnswerPanel,
  promptsFilters,
  promptsModel,
  promptsNorth,
  promptsOwn,
  promptsProjectId,
  promptsPromptId,
  promptsRows,
  promptsTopicId,
} from "./prompts-fixtures";

const model = promptsModel();

const meta = {
  title: "AI Visibility/Prompts",
  component: AiVisibilityPromptsView,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        messages={{ ...sharedMessages, ...trackingMessages }}
        timeZone="UTC"
      >
        <DateDisplayProvider>
          <Story />
        </DateDisplayProvider>
      </FeatureMessagesProvider>
    ),
  ],
  parameters: { layout: "padded" },
  args: {
    activePromptCount: 2,
    addHref: "/app/prj_example/ai-visibility?tab=prompts&compose=prompt",
    canWrite: true,
    domain: promptsOwn.domain,
    enginePrices: EMPTY_TRACKING_ENGINE_PRICES,
    engines: model.engines,
    entities: [promptsOwn, promptsNorth],
    error: null,
    filters: promptsFilters,
    historyHref: "/app/prj_example/ai-visibility?tab=prompts&view=runs",
    markets: [],
    now: model.now,
    onAssignTopic: () => undefined,
    onBulk: () => undefined,
    onFilter: () => undefined,
    onOpenEvidence: () => undefined,
    onPromptAction: () => undefined,
    onRunPrompt: () => undefined,
    onSelect: () => undefined,
    onSelectionChange: () => undefined,
    panel: null,
    pending: false,
    projectId: promptsProjectId,
    rows: promptsRows(),
    runHref: "/app/prj_example/ai-visibility?tab=prompts&compose=run",
    selectedId: null,
    selection: new Set<string>(),
    topics: [{ id: promptsTopicId, name: "Tools" }],
    truncated: false,
  },
} satisfies Meta<typeof AiVisibilityPromptsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const GroupedTable: Story = {};

export const AnswerPanel: Story = {
  args: { panel: promptsAnswerPanel(), selectedId: promptsPromptId },
};

export const EmptyAnswer: Story = {
  args: { panel: promptsAnswerPanel(true), selectedId: promptsPromptId },
};
