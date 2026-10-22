import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { SidebarFooter } from "@/components/shell/SidebarFooter";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { DEFAULT_TIME_ZONE } from "@/i18n/formats";
import shellMessages from "@/messages/core/en/shell.json";
import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";

function withShellMessages(Story: () => ReactNode) {
  return (
    <FeatureMessagesProvider
      locale={DEFAULT_LOCALE}
      messages={shellMessages}
      timeZone={DEFAULT_TIME_ZONE}
    >
      <Story />
    </FeatureMessagesProvider>
  );
}

const projectRef = "prj_7Kd2Qf9m";

const meta = {
  title: "Shell/SidebarFooter",
  component: SidebarFooter,
  decorators: [
    (Story) => (
      <div className="flex h-[220px] w-[248px] flex-col bg-bg-elev p-3.5 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SidebarFooter>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Expanded: Story = {};

export const None: Story = {
  args: { showBrand: true, version: "1.2.3" },
};

export const Pro: Story = {
  args: {
    planStatus: { kind: "pro" },
    projectRef,
    showBrand: true,
    version: "1.2.3",
  },
  decorators: [withShellMessages],
};

export const Trial: Story = {
  args: {
    planStatus: { days: 3, kind: "trial" },
    projectRef,
    showBrand: true,
    version: "1.2.3",
  },
  decorators: [withShellMessages],
};

export const CollapsedTrial: Story = {
  args: {
    collapsed: true,
    planStatus: { days: 3, kind: "trial" },
    projectRef,
    version: "1.2.3",
  },
  decorators: [
    withShellMessages,
    (Story) => (
      <div className="flex h-[220px] w-[72px] flex-col bg-bg-elev p-3 text-fg">
        <Story />
      </div>
    ),
  ],
};

export const Collapsed: Story = {
  args: { collapsed: true },
  decorators: [
    (Story) => (
      <div className="flex h-[220px] w-[72px] flex-col bg-bg-elev p-3 text-fg">
        <Story />
      </div>
    ),
  ],
};
