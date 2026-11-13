import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import messages from "@/messages/core/en/project-site-audit.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { SiteAuditForm } from "./SiteAuditForm";

const meta = {
  title: "App/SiteAudit/Form",
  component: SiteAuditForm,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        messages={{ ...sharedMessages, ...messages }}
        timeZone="UTC"
      >
        <div className="max-w-xl p-6">
          <Story />
        </div>
      </FeatureMessagesProvider>
    ),
  ],
  args: {
    maxPages: 15,
    canRun: true,
    busy: false,
    workerEnabled: false,
    run: async () => undefined,
  },
} satisfies Meta<typeof SiteAuditForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const OverTheLimit: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const field = canvas.getByLabelText("Pages to check");
    await userEvent.clear(field);
    await userEvent.type(field, "20");
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "You can check up to 15 pages per audit right now.",
    );
  },
};

export const ZeroLimit: Story = {
  args: { maxPages: 0 },
};
