import { RankTrackerHeaderContext } from "@/components/keywords/RankTrackerHeaderContext";
import type { HeaderContextMarket } from "@/lib/markets/header-context";
import { AppRealtimeContext } from "@/lib/realtime/useAppRealtime";
import type { Meta, StoryObj } from "@storybook/react";
import { AppHeaderFrame } from "./AppHeaderFrame";

const markets: HeaderContextMarket[] = [
  {
    ref: "pmkt_us",
    countryCode: "US",
    languageCode: "en",
    name: "US launch",
    description: "United States / English",
    keywordCount: 10,
    status: "active",
  },
  {
    ref: "pmkt_us_es",
    countryCode: "US",
    languageCode: "es",
    name: "Spanish audience",
    description: "United States / Spanish",
    keywordCount: 0,
    status: "paused",
  },
  {
    ref: "pmkt_malaga",
    countryCode: "ES",
    languageCode: "en",
    name: "Malaga expat audience (English speakers)",
    description: "Malaga, Spain / English",
    keywordCount: 92,
    status: "active",
  },
];
function MarketContextStory({ contexts }: { contexts: HeaderContextMarket[] }) {
  return (
    <AppRealtimeContext.Provider value={{ notifications: null, operations: [], status: "live" }}>
      <div className="min-h-[540px] bg-bg text-fg">
        <AppHeaderFrame
          activeProjectId="prj_story"
          projectRef="prj_story"
          workspaces={[]}
          canCreateWorkspace={false}
          notificationControl={null}
          context={<RankTrackerHeaderContext contexts={contexts} projectRef="prj_story" />}
        />
      </div>
    </AppRealtimeContext.Provider>
  );
}
const meta = {
  title: "Components/MarketSwitcher",
  component: MarketContextStory,
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/app/prj_story/rank-tracker" } },
  },
} satisfies Meta<typeof MarketContextStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const AllMarkets: Story = { args: { contexts: markets } };
export const OneMarket: Story = { args: { contexts: markets.slice(0, 1) } };
export const NoMarkets: Story = { args: { contexts: [] } };
export const AllPaused: Story = {
  args: { contexts: markets.map((market) => ({ ...market, status: "paused" })) },
};
export const LongName: Story = {
  args: { contexts: markets },
  parameters: { nextjs: { navigation: { pathname: "/app/prj_story/m/pmkt_malaga/rank-tracker" } } },
};
export const MobileDevice: Story = {
  args: { contexts: markets },
  parameters: {
    nextjs: {
      navigation: {
        pathname: "/app/prj_story/m/pmkt_us/rank-tracker",
        query: { device: "mobile", q: "running shoes" },
      },
    },
  },
};
export const Search: Story = {
  args: {
    contexts: [
      ...markets,
      ...Array.from({ length: 4 }, (_, i) => ({
        ...markets[0],
        name: `Regional market ${i + 1}`,
        ref: `pmkt_extra_${i}`,
      })),
    ],
  },
};
