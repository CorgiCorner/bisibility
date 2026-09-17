import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { withSharedMessages } from "@/i18n/test-support/shared-messages-story-decorator";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "UI/ConfirmModal",
  component: ConfirmModal,
  decorators: [withSharedMessages],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ConfirmModal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const DeleteKeyword: Story = {
  args: {
    kind: "deleteKeyword",
    onClose: () => undefined,
    onConfirm: () => undefined,
    open: true,
  },
  render: (args) => (
    <div className="min-h-[520px] bg-bg text-fg">
      <ConfirmModal {...args} />
    </div>
  ),
};

export const DeleteWorkspaceTypeToConfirm: Story = {
  args: {
    kind: "deleteProject",
    onClose: () => undefined,
    onConfirm: () => undefined,
    open: true,
    typeWord: "acme.dev",
  },
  render: DeleteKeyword.render,
};
