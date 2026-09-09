import { ConsentSettingsModal } from "@/components/analytics/ConsentSettingsModal";
import { pendingConsent } from "@/lib/analytics/consent";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "storybook/test";

const saveConsent = fn(async (values: { analytics: boolean; replay: boolean }) => ({
  ...values,
  decidedAt: 1,
  status: "decided" as const,
}));

const meta = {
  args: {
    initialConsent: pendingConsent(),
    onClose: fn(),
    open: true,
    saveConsent,
  },
  component: ConsentSettingsModal,
  parameters: { layout: "fullscreen" },
  title: "Analytics/ConsentSettingsModal",
} satisfies Meta<typeof ConsentSettingsModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ChooseReplay: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const replay = body.getByRole("switch", { name: /Replays/ });
    await expect(replay).toBeEnabled();
    await userEvent.click(replay);
    await userEvent.click(body.getByRole("button", { name: "Save" }));
    await expect(saveConsent).toHaveBeenCalledWith({ analytics: false, replay: true });
  },
};
