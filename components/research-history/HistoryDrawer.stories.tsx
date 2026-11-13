import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import type {
  HistoryPage,
  HistoryQuery,
  HistoryRow,
  HistoryRowMeta,
} from "@/lib/research-history/contract";
import ai from "@/messages/core/en/project-ai-research.json";
import research from "@/messages/core/en/project-research.json";
import history from "@/messages/core/en/research-history.json";
import shared from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "storybook/test";
import { HistoryDrawer } from "./HistoryDrawer";
import { KeywordHistoryMeta, ModelHistoryMeta, SerpHistoryMeta } from "./HistoryMeta";
import type { HistoryAdapter } from "./history-adapter";

const messages = { ...shared, ...history, ...ai, ...research };

function sample(index: number, meta: HistoryRowMeta, pinned = false): HistoryRow {
  const day = index < 3 ? "2026-11-10" : index < 6 ? "2026-11-09" : "2026-11-01";
  return {
    cost:
      index % 3 === 0
        ? { kind: "cached" }
        : index % 3 === 1
          ? { kind: "unknown" }
          : {
              kind: "amount",
              amount: {
                certainty: "measured",
                unit: { kind: "currency", code: "USD" },
                value: "0.12",
              },
            },
    key: `row-${index}`,
    meta,
    occurredAt: `${day}T${String(8 + (index % 6)).padStart(2, "0")}:15:00.000Z`,
    pinned,
    title: `example.com query ${index}`,
  };
}

const modelMeta: HistoryRowMeta = { engines: ["chat_gpt", "claude"], kind: "model" };
const serpMeta: HistoryRowMeta = {
  aiOverview: true,
  device: "desktop",
  kind: "serp",
  market: "United States",
};
const keywordMeta: HistoryRowMeta = {
  kind: "keyword",
  mode: "ideas",
  scope: "United States / English",
};

function pageFor(rows: HistoryRow[], query: HistoryQuery): HistoryPage {
  const needle = query.query.trim().toLowerCase();
  const matched = rows.filter((row) => !needle || row.title.toLowerCase().includes(needle));
  const pinnedOnly = query.filters.some((filter) => filter.facet === "pinned");
  const visible = [...(pinnedOnly ? matched.filter((row) => row.pinned) : matched)].sort(
    (left, right) => right.occurredAt.localeCompare(left.occurredAt),
  );
  const groups: HistoryPage["groups"] = [];
  for (const row of visible) {
    const day = row.occurredAt.slice(0, 10);
    const label = day === "2026-11-10" ? "today" : day === "2026-11-09" ? "yesterday" : "date";
    const last = groups.at(-1);
    if (last?.day === day) last.rows.push(row);
    else groups.push({ day, label, rows: [row] });
  }
  return {
    chips: [{ facet: "engine", value: "chat_gpt" }],
    groups,
    nextCursor: null,
    pinnedCount: matched.filter((row) => row.pinned).length,
    timeZone: "UTC",
    total: visible.length,
  };
}

function adapter(rows: HistoryRow[], noun: "checks" | "runs" = "runs"): HistoryAdapter {
  return {
    allHref: noun === "runs" ? "/app/prj_example/agent-reports?kind=prompt_explorer" : undefined,
    chipLabel: (chip) => chip.value,
    loadPage: async (query) => pageFor(rows, query),
    noun,
    onOpen: () => undefined,
    onTogglePin: async () => true,
    renderMeta: (row) => {
      if (row.meta.kind === "model") return <ModelHistoryMeta engines={row.meta.engines} />;
      if (row.meta.kind === "serp") {
        return (
          <SerpHistoryMeta
            aiOverview={row.meta.aiOverview}
            device={row.meta.device}
            market={row.meta.market}
          />
        );
      }
      if (row.meta.kind === "keyword")
        return <KeywordHistoryMeta mode={row.meta.mode} scope={row.meta.scope} />;
      return null;
    },
    searchPlaceholder: noun === "runs" ? "Search prompts" : "Search keywords",
  };
}

const many = [
  ...Array.from({ length: 4 }, (_, index) => sample(index, modelMeta, index === 1)),
  ...Array.from({ length: 4 }, (_, index) => sample(index + 4, serpMeta)),
];

const meta = {
  title: "Research/History drawer",
  component: HistoryDrawer,
  args: { onClose: () => undefined, open: true },
  decorators: [
    (Story) => (
      <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
        <Story />
      </FeatureMessagesProvider>
    ),
  ],
} satisfies Meta<typeof HistoryDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ManyRows: Story = { args: { adapter: adapter(many) } };

export const Pinned: Story = {
  args: { adapter: adapter(many) },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /Pinned/ }));
  },
};

export const Empty: Story = { args: { adapter: adapter([]) } };

export const ErrorState: Story = {
  args: {
    adapter: {
      ...adapter([]),
      loadPage: async () => {
        throw new Error("History unavailable");
      },
    },
  },
};

export const Mobile: Story = {
  args: { adapter: adapter(many, "checks") },
  decorators: [
    (Story) => {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: (query: string) => ({
          matches: !query.includes("min-width"),
          media: query,
          onchange: null,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
          dispatchEvent: () => false,
        }),
      });
      return <Story />;
    },
  ],
};

const longTitle = "Compare answers for search console import and weekly report.";

export const LongTitles: Story = {
  args: {
    adapter: adapter([
      { ...sample(0, modelMeta), title: longTitle },
      { ...sample(1, serpMeta), title: longTitle },
      { ...sample(2, keywordMeta, true), title: longTitle },
    ]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const day = await canvas.findByRole("heading", { name: "Today" });
    expect(day).toHaveClass("text-ui-micro", "uppercase");
    const title = canvas.getAllByText(longTitle)[0];
    const row = title?.closest("button");
    expect(row?.querySelector("time")).toBeTruthy();
    expect(row?.querySelector("[data-history-cost]")).toBeTruthy();
    expect(canvas.getAllByRole("button", { name: /Pin|Unpin/ })[0]).toHaveClass("size-8");
  },
};

export const ModelMeta: Story = { args: { adapter: adapter([sample(0, modelMeta)]) } };
export const SerpMeta: Story = { args: { adapter: adapter([sample(1, serpMeta)], "checks") } };
export const KeywordMeta: Story = {
  args: { adapter: adapter([sample(2, keywordMeta)], "checks") },
};
