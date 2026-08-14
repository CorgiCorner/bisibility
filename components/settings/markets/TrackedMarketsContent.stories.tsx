import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { MAX_PROJECT_MARKETS } from "@/lib/markets/limits";
import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";
import { TrackedMarketsContent } from "./TrackedMarketsContent";

const projectId = "prj_abcdefghijklmnopqrstuvwx";
const markets = {
  markets: [
    {
      canonicalKey: "ES",
      countryCode: "ES",
      displayName: "Spain",
      id: "pmkt_spain_spanish",
      languageLabel: "Spanish",
      languageCode: "es",
      monthlyCostCents: 1100,
      researchAvailable: true,
      status: "active" as const,
    },
    {
      canonicalKey: "ES@en",
      countryCode: "ES",
      displayName: "Spain",
      id: "pmkt_spain_english",
      languageLabel: "English",
      languageCode: "en",
      monthlyCostCents: 1100,
      researchAvailable: true,
      status: "active" as const,
    },
    {
      canonicalKey: "BE",
      countryCode: "BE",
      displayName: "Belgium",
      id: "pmkt_belgium_dutch",
      languageLabel: "Dutch",
      languageCode: "nl",
      monthlyCostCents: 1100,
      researchAvailable: true,
      status: "paused" as const,
    },
    {
      canonicalKey: "BE@ar",
      countryCode: "BE",
      displayName: "Belgium",
      id: "pmkt_belgium_arabic",
      languageLabel: "Arabic",
      languageCode: "ar",
      monthlyCostCents: 1100,
      researchAvailable: false,
      status: "active" as const,
    },
  ],
  maxMarkets: MAX_PROJECT_MARKETS,
  monthlyCostCents: 3300,
  perMarketChecks: 24,
  projectId,
};
const firstMarket = markets.markets[0];
if (!firstMarket) throw new Error("Tracked market story fixture is missing its first row.");

const meta = {
  component: TrackedMarketsContent,
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
  title: "Settings/Tracking/Markets",
} satisfies Meta<typeof TrackedMarketsContent>;

export default meta;
type Story = StoryObj<typeof meta>;

const args = {
  addMarkets: fn(
    async () =>
      ({
        added: 1,
        marketIds: ["pmkt_abcdefghijklmnopqrstuvwx"],
        ok: true,
      }) as const,
  ),
  canEdit: true,
  canRemove: true,
  markets,
  removeMarket: fn(async () => undefined),
  setMarketEnabled: fn(async () => undefined),
} satisfies Story["args"];

export const Default: Story = { args };

export const Empty: Story = {
  args: { ...args, markets: { ...markets, markets: [], monthlyCostCents: 0, perMarketChecks: 0 } },
};

export const AtMarketCap: Story = {
  args: {
    ...args,
    markets: {
      ...markets,
      markets: [...markets.markets, firstMarket],
      monthlyCostCents: 4400,
    },
  },
};
