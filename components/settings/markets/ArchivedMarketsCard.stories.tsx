import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";
import { ArchivedMarketsCard } from "./ArchivedMarketsCard";

const projectId = "prj_abcdefghijklmnopqrstuvwx";
const markets = {
  markets: [
    { displayName: "Spain", id: "pmkt_spain_spanish", keywordCount: 24, languageLabel: "Spanish" },
    { displayName: "Belgium", id: "pmkt_belgium_arabic", keywordCount: 1, languageLabel: "Arabic" },
  ],
  projectId,
};

const meta = {
  component: ArchivedMarketsCard,
  decorators: [
    (Story) => (
      <main className="min-h-screen bg-bg p-6 text-fg">
        <SettingsShell activeSection="tracking" projectRef={projectId}>
          <Story />
        </SettingsShell>
      </main>
    ),
  ],
  parameters: { nextjs: { appDirectory: true } },
  title: "Settings/Tracking/ArchivedMarkets",
} satisfies Meta<typeof ArchivedMarketsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const args = {
  canEdit: true,
  markets,
  restoreMarket: fn(async () => undefined),
} satisfies Story["args"];

export const Default: Story = { args };

export const ReadOnly: Story = { args: { ...args, canEdit: false } };
