import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import type { SavedSiteAudit } from "@/lib/site-audit/schema";
import messages from "@/messages/core/en/project-site-audit.json";
import sharedMessages from "@/messages/core/en/shared.json";
import polishMessages from "@/messages/core/pl/project-site-audit.json";
import polishSharedMessages from "@/messages/core/pl/shared.json";
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
const runningAudit = {
  ...auditFixture,
  result: {
    ...auditFixture.result,
    target: "https://example.com/",
    pages: auditFixture.result.pages.map((page) => ({
      ...page,
      url: page.url.replace("acme.com", "example.com"),
      finalUrl: page.finalUrl.replace("acme.com", "example.com"),
      canonical: page.canonical?.replace("acme.com", "example.com") ?? null,
      internalLinks: page.internalLinks.map((url) => url.replace("acme.com", "example.com")),
    })),
  },
  run: {
    state: "running",
    stopReason: null,
    pagesCrawled: 2,
    budgetPages: 15,
    requests: 3,
    startedAt: null,
    completedAt: null,
  },
};
export const InProgress: Story = {
  args: {
    domain: "example.com",
    workerEnabled: true,
    initial: runningAudit,
    readAction: async () => runningAudit,
    cancelAction: async () => undefined,
  },
  render: (args) => {
    let current: SavedSiteAudit = runningAudit;
    return (
      <SiteAuditWorkspace
        {...args}
        initial={current}
        readAction={async () => current}
        cancelAction={async () => {
          if (!current.run) return;
          current = {
            ...current,
            run: { ...current.run, state: "cancelled", stopReason: "cancelled" },
          };
        }}
        resumeAction={async () => {
          if (!current.run) return;
          current = { ...current, run: { ...current.run, state: "running", stopReason: null } };
        }}
      />
    );
  },
};
export const InProgressPolish: Story = {
  args: {
    domain: "example.com",
    workerEnabled: true,
    initial: runningAudit,
    readAction: async () => runningAudit,
    cancelAction: async () => undefined,
  },
  render: (args) => (
    <FeatureMessagesProvider
      locale="pl"
      messages={{ ...polishSharedMessages, ...polishMessages }}
      timeZone="UTC"
    >
      <SiteAuditWorkspace {...args} />
    </FeatureMessagesProvider>
  ),
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

export const LoadingResults: Story = {
  args: { runAction: async () => new Promise(() => {}) },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Run audit" }));
    await expect(within(canvasElement).getByRole("table")).toBeVisible();
  },
};
