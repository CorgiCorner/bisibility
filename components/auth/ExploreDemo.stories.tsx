import type { Meta, StoryObj } from "@storybook/react";
import { ExploreDemo } from "./ExploreDemo";

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
