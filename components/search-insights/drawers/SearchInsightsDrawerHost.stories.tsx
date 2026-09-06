import { ToastProvider } from "@/components/ui";
import type { Meta, StoryObj } from "@storybook/react";
import { userEvent, within } from "storybook/test";
import {
  storyBandList,
  storyCostContext,
  storyOverlapList,
  storyPageDetail,
  storyProjectMarkets,
  storyQueryDetail,
} from "./drawer-story-fixtures";
import { SearchInsightsDrawerHost } from "./SearchInsightsDrawerHost";
import { useSearchInsightsDrawerHandlers } from "./useDrawerHandlers";

function Openers() {
  const drawers = useSearchInsightsDrawerHandlers();
  const button =
    "rounded-control border border-border bg-bg-elev px-3 py-2 text-ui-caption font-semibold";
  return (
    <div className="flex flex-wrap gap-2">
      <button className={button} onClick={() => drawers.openList("band", 33, 1_284)} type="button">
        Positions 4 to 20
      </button>
      <button
        className={button}
        onClick={() => drawers.openList("overlap", 5, 1_284)}
        type="button"
      >
        Page overlap
      </button>
      <button
        className={button}
        onClick={() => drawers.openQuery({ query: storyQueryDetail.query })}
        type="button"
      >
        {storyQueryDetail.query}
      </button>
      <button
        className={button}
        onClick={() =>
          drawers.openPage({
            clicks: 0,
            ctr: 0,
            engagementRate: null,
            impressions: 0,
            keyEvents: null,
            path: storyPageDetail.path,
            position: 0,
            sessions: null,
            url: storyPageDetail.url,
          })
        }
        type="button"
      >
        {storyPageDetail.path}
      </button>
    </div>
  );
}

const meta = {
  component: SearchInsightsDrawerHost,
  decorators: [
    (Story) => (
      <ToastProvider>
        <div className="min-h-screen bg-bg p-4 text-fg sm:p-6">
          <Story />
        </div>
      </ToastProvider>
    ),
  ],
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  title: "Search Console/Drawer",
} satisfies Meta<typeof SearchInsightsDrawerHost>;

export default meta;
type Story = StoryObj<typeof meta>;

const args = {
  addKeywordsAction: async () => ({
    created: 1,
    persistedKeywordCount: 1,
    keywords: [],
    skippedDuplicates: 0,
  }),
  canCreateKeyword: true,
  children: <Openers />,
  loadBandListAction: async () => storyBandList,
  loadOverlapListAction: async () => storyOverlapList,
  loadPageDetailAction: async () => storyPageDetail,
  loadQueryDetailAction: async () => storyQueryDetail,
  loadTrackDialogAction: async () => ({
    costContext: storyCostContext,
    defaultDevice: "desktop" as const,
    defaultMarketKey: "es-es",
    projectMarkets: storyProjectMarkets,
  }),
  period: "28",
  projectId: "prj_story",
  property: "sc-domain:example.com",
} satisfies StoryObj<typeof meta>["args"];

export const Closed: Story = { args };

export const QueryFrame: Story = {
  args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText(storyQueryDetail.query));
  },
};

export const PageFrame: Story = {
  args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText(storyPageDetail.path));
  },
};

export const BandList: Story = {
  args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText("Positions 4 to 20"));
  },
};

export const OverlapList: Story = {
  args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText("Page overlap"));
  },
};
