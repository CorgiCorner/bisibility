import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";
import { CompetitorSetTable } from "./CompetitorSetTable";

const projectId = "prj_abcdefghijklmnopqrstuvwx";
const markets = [
  { id: "pmkt_abcdefghijklmnopqrstuvwx", label: "Flanders" },
  { id: "pmkt_bbcdefghijklmnopqrstuvwx", label: "Lisbon" },
];

const competitors = Array.from({ length: 10 }, (_, index) => ({
  aliases: index === 0 ? ["Contentful", "Contentful CMS"] : [`Brand ${index + 1}`],
  createdAt: new Date(`2026-09-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`),
  domain: `competitor-${index + 1}.example.com`,
  evidence: index === 0 ? { bestPosition: 3, of: 12, seenOn: 9 } : null,
  overrides:
    index === 0
      ? [{ marketId: markets[0].id, marketLabel: "Flanders", mode: "excluded" as const }]
      : index === 1
        ? [{ marketId: markets[0].id, marketLabel: "Flanders", mode: "added" as const }]
        : [],
  publicId: `cmp_abcdefghijklmnopqrstuvwx${index}`,
  scopePolicy: index === 1 ? ("selected_markets" as const) : ("all_markets" as const),
  source: index === 0 ? ("suggested" as const) : ("manual" as const),
}));

const meta = {
  component: CompetitorSetTable,
  decorators: [
    (Story) => (
      <main className="min-h-screen bg-bg p-6 text-fg">
        <SettingsShell activeSection="competitors" projectRef={projectId}>
          <Story />
        </SettingsShell>
      </main>
    ),
  ],
  parameters: {
    chromatic: { viewports: [390, 768, 1440] },
    nextjs: { appDirectory: true },
  },
  title: "Settings/Competitors/Set table",
} satisfies Meta<typeof CompetitorSetTable>;

export default meta;
type Story = StoryObj<typeof meta>;

const args = {
  addCompetitor: fn(async () => ({})),
  canDelete: true,
  canEdit: true,
  competitors,
  markets,
  projectId,
  removeCompetitor: fn(async () => ({})),
  replaceMarkets: fn(async () => ({})),
  updateCompetitor: fn(async () => ({})),
} satisfies Story["args"];

export const Empty: Story = { args: { ...args, competitors: [] } };
export const Few: Story = { args: { ...args, competitors: competitors.slice(0, 5) } };
export const Many: Story = { args };
export const Edit: Story = {
  args: {
    ...args,
    competitors: competitors.slice(0, 5),
    initiallyEditingCompetitorId: competitors[0].publicId,
  },
};
