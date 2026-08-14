import { DimensionSwitcher } from "@/components/keywords/filters/DimensionSwitcher";
import { ProjectWriteModeProvider } from "@/components/shell/ProjectWriteModeProvider";
import {
  DeviceMobileIcon as DeviceMobile,
  FlagIcon as Flag,
  MonitorIcon as Monitor,
} from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "storybook/test";

const meta = {
  title: "Keywords/DimensionSwitcher",
  component: DimensionSwitcher,
  decorators: [
    (Story) => (
      <div className="min-h-[360px] bg-bg p-8 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DimensionSwitcher>;

export default meta;

type Story = StoryObj<typeof meta>;

export const DeviceAddFocused: Story = {
  args: {
    icon: <Monitor aria-hidden size={13} />,
    kind: "device",
    label: "desktop",
    onTrack: () => undefined,
    value: "desktop",
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /desktop/i }));
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      body.getByRole("menuitem", { name: "desktop, currently shown" }),
    ).toBeInTheDocument();
    await expect(body.getByRole("menuitem", { name: "Add Mobile" })).toBeInTheDocument();
  },
};

export const CustomLocation: Story = {
  args: {
    icon: <Flag aria-hidden size={13} />,
    kind: "location",
    label: "Warsaw",
    onTrack: () => undefined,
    value: "Warsaw",
  },
};

export const ReadOnly: Story = {
  args: {
    icon: <DeviceMobile aria-hidden size={13} />,
    kind: "device",
    label: "mobile",
    onTrack: () => undefined,
    value: "mobile",
  },
  render: (args) => (
    <ProjectWriteModeProvider projectRef="prj_1" writeMode="migration_hold">
      <DimensionSwitcher {...args} />
    </ProjectWriteModeProvider>
  ),
};
