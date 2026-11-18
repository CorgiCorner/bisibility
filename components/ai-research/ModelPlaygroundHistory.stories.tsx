import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { HistoryDrawer } from "@/components/research-history/HistoryDrawer";
import type { HistoryAdapter } from "@/components/research-history/history-adapter";
import { input } from "@/lib/model-playground/contract-fixtures.test-support";
import type { HistoryRow } from "@/lib/research-history/contract";
import research from "@/messages/core/en/project-ai-research.json";
import history from "@/messages/core/en/research-history.json";
import shared from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { historyModelOption } from "./ModelPlaygroundHistory";
import { ModelPlaygroundTrackDialog } from "./ModelPlaygroundTrackDialog";

function HistoryFixture({
  count = 3,
  mixed = false,
  pinned = false,
  unknown = false,
}: Readonly<{ count?: number; mixed?: boolean; pinned?: boolean; unknown?: boolean }>) {
  const items: HistoryRow[] = Array.from({ length: count }, (_, i) => ({
    key: `story-${i}`,
    title:
      i % 2
        ? "Compare directories for a small team choosing marketing and coding tools"
        : "Which tools help a small team?",
    occurredAt: "2026-11-13T12:00:00Z",
    pinned: pinned && i < 3,
    cost: unknown
      ? { kind: "unknown" }
      : {
          kind: "amount",
          amount: {
            value: "0.0123",
            certainty: "measured",
            unit: { kind: "currency", code: "USD" },
          },
        },
    meta: {
      kind: "model",
      engines: [
        mixed && i % 2 ? "Legacy Claude" : "OpenRouter / anthropic/claude-sonnet · API response",
      ],
    },
  }));
  const adapter: HistoryAdapter = {
    allHref: "/app/prj_fixture/agent-reports?kind=prompt_explorer",
    chipLabel: (chip) => chip.value,
    modelOption: historyModelOption,
    noun: "runs",
    searchPlaceholder: "Search prompts",
    onOpen: () => {},
    onTogglePin: async () => true,
    renderMeta: (row) => (row.meta.kind === "model" ? row.meta.engines.join(", ") : null),
    loadPage: async ({ query, filters, cursor }) => {
      const filtered = items.filter(
        (item) =>
          item.title.toLowerCase().includes(query.toLowerCase()) &&
          (!filters.some((f) => f.facet === "pinned") || item.pinned),
      );
      const offset = Number(cursor ?? 0);
      const rows = filtered.slice(offset, offset + 30);
      return {
        chips: [{ facet: "engine", value: "api:openrouter:anthropic/claude-sonnet" }],
        groups: rows.length ? [{ day: "2026-11-13", label: "today", rows }] : [],
        nextCursor: offset + 30 < filtered.length ? String(offset + 30) : null,
        pinnedCount: items.filter((item) => item.pinned).length,
        timeZone: "UTC",
        total: filtered.length,
      };
    },
  };
  return <HistoryDrawer open onClose={() => {}} adapter={adapter} />;
}
const meta = {
  title: "Research/Model Playground History",
  component: HistoryFixture,
  parameters: { layout: "padded", themeControls: false, nextjs: { appDirectory: true } },
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        timeZone="UTC"
        messages={{ ...shared, ...research, ...history }}
      >
        <Story />
      </FeatureMessagesProvider>
    ),
  ],
} satisfies Meta<typeof HistoryFixture>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = { args: { count: 0 } };
export const ThreeItems: Story = {};
export const HundredPlus: Story = { args: { count: 128 } };
export const MixedLegacyAndNative: Story = { args: { mixed: true } };
export const UnknownCombinedCost: Story = { args: { unknown: true } };
export const Pinned: Story = { args: { count: 128, pinned: true } };
export const TrackDialog: Story = {
  render: () => (
    <ModelPlaygroundTrackDialog
      open
      onClose={() => {}}
      projectId="prj_aaaaaaaaaaaaaaaaaaaaaaaa"
      runId="019a70b2-0000-7000-8000-000000000001"
      input={{
        ...input(),
        columns: [
          input().columns[0],
          {
            ...input().columns[0],
            columnId: "019a70b2-0000-7000-8000-000000000002",
            providerId: "vercel_ai_gateway",
            modelId: "anthropic/claude-sonnet-with-a-long-but-valid-model-name",
          },
        ],
      }}
      topics={[{ id: "ait_aaaaaaaaaaaaaaaaaaaaaaaa", name: "Marketing research" }]}
    />
  ),
};
export const TrackCapacity: Story = {
  render: () => (
    <ModelPlaygroundTrackDialog
      open
      onClose={() => {}}
      projectId="prj_aaaaaaaaaaaaaaaaaaaaaaaa"
      runId="019a70b2-0000-7000-8000-000000000001"
      input={input()}
      topics={[]}
      save={async () => ({ ok: false, reason: "capacity" })}
    />
  ),
};
