import type { Meta, StoryObj } from "@storybook/react";
import { EditableDemoLogin } from "./EditableDemoLogin";

const meta = {
  title: "Auth/EditableDemoLogin",
  component: EditableDemoLogin,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="w-full max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EditableDemoLogin>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
