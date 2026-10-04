import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import messages from "@/messages/core/en/project-site-audit.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { SiteAuditWorkspace } from "./SiteAuditWorkspace";
import { auditFixture } from "./story-fixtures";

const meta = {
  title: "App/SiteAudit/Workspace",
  component: SiteAuditWorkspace,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        messages={{ ...sharedMessages, ...messages }}
        timeZone="UTC"
      >
        <div className="mx-auto max-w-[1200px] p-6">
          <Story />
        </div>
      </FeatureMessagesProvider>
    ),
  ],
  args: {
    domain: "acme.com",
    projectId: "prj_demo",
    canRun: true,
    initial: null,
    history: [],
    runAction: async () => auditFixture,
    readAction: async () => auditFixture,
  },
} satisfies Meta<typeof SiteAuditWorkspace>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = {};
export const Results: Story = {
  args: {
    initial: auditFixture,
    history: [
      { id: auditFixture.id, createdAt: auditFixture.createdAt, title: "Site audit: acme.com" },
    ],
  },
};
export const ReadOnly: Story = { args: { canRun: false, initial: auditFixture } };
export const Failure: Story = {
  args: {
    runAction: async () => {
      throw new Error("Site audit rate limit reached. Try again in one minute.");
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Run audit" }));
    await expect(canvas.getByRole("alert")).toBeVisible();
  },
};
export const RunAudit: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Run audit" }));
    await expect(canvas.getByText("URL issues")).toBeVisible();
  },
};

export const PageDetails: Story = {
  args: { initial: auditFixture },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getAllByRole("button", { name: "Page details" })[0]);
    await expect(
      within(canvasElement.ownerDocument.body).getByRole("dialog", { name: "Page details" }),
    ).toBeVisible();
  },
};
