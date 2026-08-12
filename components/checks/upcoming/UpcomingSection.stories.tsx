import { appPath } from "@/lib/routing/app-path";
import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";
import { UpcomingSection } from "./UpcomingSection";
import {
  emptyUpcomingView,
  upcomingNoProviderView,
  upcomingNow,
  upcomingUnblockedView,
  upcomingViewFixture,
} from "./upcoming-fixtures";

const hrefs = {
  providerSettingsHref: `${appPath("prj_story", "settings")}#providers`,
  schedulesHref: appPath("prj_story", "rank-tracker"),
  timelineHref: `${appPath("prj_story", "settings")}#migration`,
};

function Frame({ children, width }: Readonly<{ children: ReactNode; width: string }>) {
  return <div style={{ maxWidth: width }}>{children}</div>;
}

const meta = {
  component: UpcomingSection,
  decorators: [
    (Story) => (
      <div className="min-h-[520px] bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: "fullscreen" },
  title: "Checks/Upcoming/UpcomingSection",
} satisfies Meta<typeof UpcomingSection>;

export default meta;

type Story = StoryObj<typeof meta>;

const sharedArgs = {
  ...hrefs,
  now: upcomingNow,
  timeZone: "Europe/Warsaw",
} as const;

export const RailExpanded: Story = {
  args: {
    ...sharedArgs,
    initialExpandedDayKey: "2026-07-24",
    mode: "rail",
    view: upcomingViewFixture,
  },
  render: (args) => (
    <Frame width="360px">
      <UpcomingSection {...args} />
    </Frame>
  ),
};

export const Slim: Story = {
  args: {
    ...sharedArgs,
    mode: "slim",
    view: upcomingUnblockedView,
  },
  render: (args) => (
    <Frame width="720px">
      <UpcomingSection {...args} />
    </Frame>
  ),
};

export const StripSheetOpen: Story = {
  args: {
    ...sharedArgs,
    initialOpenDayKey: "2026-07-24",
    mode: "strip",
    view: upcomingViewFixture,
  },
  render: (args) => (
    <Frame width="900px">
      <UpcomingSection {...args} />
    </Frame>
  ),
};

export const NoProviderOnly: Story = {
  args: {
    ...sharedArgs,
    mode: "rail",
    view: upcomingNoProviderView,
  },
  render: (args) => (
    <Frame width="360px">
      <UpcomingSection {...args} />
    </Frame>
  ),
};

export const AllBlockedReasons: Story = {
  args: {
    ...sharedArgs,
    mode: "rail",
    view: upcomingViewFixture,
  },
  render: (args) => (
    <Frame width="360px">
      <UpcomingSection {...args} />
    </Frame>
  ),
};

export const NoBlockedReasons: Story = {
  args: {
    ...sharedArgs,
    mode: "rail",
    view: upcomingUnblockedView,
  },
  render: (args) => (
    <Frame width="360px">
      <UpcomingSection {...args} />
    </Frame>
  ),
};

export const Empty: Story = {
  args: {
    ...sharedArgs,
    mode: "rail",
    view: emptyUpcomingView,
  },
  render: (args) => (
    <Frame width="360px">
      <UpcomingSection {...args} />
    </Frame>
  ),
};
