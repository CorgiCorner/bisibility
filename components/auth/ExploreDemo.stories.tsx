import { ExploreDemo } from "@/components/auth/ExploreDemo";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Auth/ExploreDemo",
  component: ExploreDemo,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="w-full max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ExploreDemo>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const DeepLink: Story = {
  args: { nextPath: "/app/prj_example/keyword-research?seed=ai%20tools%20directory" },
};
