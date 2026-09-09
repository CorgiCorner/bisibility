import type { OperationSnapshot } from "@/lib/rank-check/runs/contract";
import { AppRealtimeContext, type AppRealtimeValue } from "@/lib/realtime/useAppRealtime";
import type { Meta, StoryObj } from "@storybook/react";
import { OperationsTray } from "./OperationsTray";

const rankCheck = {
  blockedReason: null,
  costCents: 0,
  counts: {
    cancelled: 0,
    completed: 126,
    deferred: 0,
    failed: 2,
    requested: 700,
    skipped: 0,
    total: 700,
  },
  estimatedCostCents: 0,
  finishedAt: null,
  id: "rcr_story",
  keywordCount: 350,
  kind: "rank_check",
  outcome: null,
  parentRunId: null,
  nextCheckAt: null,
  plannedFor: null,
  provider: "serpapi",
  providerLabel: "SerpApi",
  selectionKind: "filter",
  startedAt: "2026-09-03T12:00:00.000Z",
  status: "running",
  targetCount: 700,
  trigger: "manual",
} satisfies OperationSnapshot;

type TrayStoryProps = {
  defaultOpen?: boolean;
  operations: OperationSnapshot[];
  status?: AppRealtimeValue["status"];
  theme?: "dark" | "light";
};

function TrayStory({
  defaultOpen,
  operations,
  status = "live",
  theme = "light",
}: Readonly<TrayStoryProps>) {
  return (
    <AppRealtimeContext.Provider value={{ notifications: null, operations, status }}>
      <div className="min-h-[320px] bg-bg p-8 text-fg" data-theme={theme}>
        <OperationsTray defaultOpen={defaultOpen} projectRef="prj_story" />
      </div>
    </AppRealtimeContext.Provider>
  );
}

const meta = {
  title: "Dashboard/Runs",
  component: TrayStory,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof TrayStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OpsopenTrue: Story = {
  args: { operations: [rankCheck] },
  name: "opsopen-true",
};

export const OpsopenDark: Story = {
  args: { operations: [rankCheck], theme: "dark" },
  name: "opsopen-dark",
};

export const OpsmodalAttention: Story = {
  args: {
    operations: [
      {
        capabilities: { pause: false, resume: false, retry: false },
        id: "import_story",
        kind: "gsc_import",
        presentation: {
          action: null,
          supportingText: "Google has not reported finalized search data for this property yet.",
          title: "Waiting for data",
        },
        property: "sc-domain:example.com",
        progress: { done: 12, total: 31 },
        state: "waiting_for_first_data",
      },
    ],
    status: "live-polling",
  },
  name: "opsmodal-attention",
};

export const OpsidleLight: Story = {
  args: { defaultOpen: false, operations: [] },
  name: "opsidle-light",
};

export const OpsidleDark: Story = {
  args: { defaultOpen: false, operations: [], theme: "dark" },
  name: "opsidle-dark",
};

export const OpsmodalEmpty: Story = {
  args: { operations: [], status: "offline" },
  name: "opsmodal-empty",
};

const historyImport = {
  capabilities: { pause: true, resume: false, retry: false },
  id: "import_history_story",
  kind: "gsc_import",
  presentation: { action: "pause", supportingText: "Import is running.", title: "Importing" },
  progress: { done: 56, total: 488 },
  property: "sc-domain:example.com",
  state: "running",
} satisfies OperationSnapshot;

export const ImportingFullHistory: Story = {
  args: { defaultOpen: true, operations: [historyImport] },
};

export const AllDaysImportedStillRunning: Story = {
  args: {
    defaultOpen: true,
    operations: [
      {
        ...historyImport,
        progress: { done: 488, total: 488 },
        presentation: {
          ...historyImport.presentation,
          supportingText: "All planned days are imported. Import is still running.",
        },
      },
    ],
  },
};
