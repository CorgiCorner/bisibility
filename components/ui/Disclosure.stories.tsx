import { Disclosure } from "@/components/ui/Disclosure";
import type { Meta, StoryObj } from "@storybook/react";

const answer =
  "Competitor positions are read from the same SERP snapshot as your own keyword check, so they add zero additional provider checks.";

function Answer({ children }: Readonly<{ children: string }>) {
  return <p className="m-0 text-[14.5px] leading-[1.6] text-fg-muted">{children}</p>;
}

const meta = {
  title: "UI/Disclosure",
  component: Disclosure,
  args: {
    children: <Answer>{answer}</Answer>,
    title: "Do competitor rankings cost extra?",
  },
  decorators: [
    (Story) => (
      <div className="grid max-w-[680px] gap-4 bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Disclosure>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Collapsed: Story = {};

export const Open: Story = {
  args: { defaultOpen: true },
};

export const Group: Story = {
  render: () => (
    <>
      <Disclosure defaultOpen title="How is the number of SERP checks calculated?">
        <Answer>Keywords by locations by devices by runs per month.</Answer>
      </Disclosure>
      <Disclosure title="Do competitor rankings cost extra?">
        <Answer>{answer}</Answer>
      </Disclosure>
      <Disclosure title="Can I cap my monthly SERP spend?">
        <Answer>Yes, project owners and admins can change the cap in Settings.</Answer>
      </Disclosure>
    </>
  ),
};
