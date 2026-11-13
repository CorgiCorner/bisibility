import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { timelineFeatureTestMessages } from "@/i18n/test-support/feature-test-messages";
import type { AnnotationsView } from "@/lib/annotations/types";
import type { Meta, StoryObj } from "@storybook/react";
import { AnnotationsBoard } from "./AnnotationsBoard";

const view: AnnotationsView = {
  now: "2026-11-10T12:00:00.000Z",
  signals: [
    {
      actor: "Ada",
      happenedAt: "2026-11-01T00:00:00.000Z",
      id: "sig_note",
      payload: { note: "Added FAQ to 20 tool pages" },
      source: "manual",
      type: "note",
      url: null,
    },
  ],
  timeZone: "UTC",
  updates: [
    {
      beginsAt: "2026-09-24T16:15:00.000Z",
      endsAt: "2026-10-08T08:00:00.000Z",
      id: "XhUD",
      name: "September 2026 spam update",
      service: "Ranking",
      uri: "incidents/XhUD",
    },
  ],
  windowStart: "2026-08-12T12:00:00.000Z",
};

const meta = {
  component: AnnotationsBoard,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider locale="en" messages={timelineFeatureTestMessages} timeZone="UTC">
        <div className="min-h-screen bg-bg p-6 text-fg">
          <Story />
        </div>
      </FeatureMessagesProvider>
    ),
  ],
  parameters: { nextjs: { appDirectory: true } },
  title: "Annotations/Board",
} satisfies Meta<typeof AnnotationsBoard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithNoteAndGoogleUpdate: Story = {
  args: {
    canCreate: true,
    canDelete: true,
    developersHref: "/app/prj_story/settings/developers",
    hideAutomatic: false,
    initialFilter: "all",
    initialSelected: null,
    locale: "en",
    projectId: "prj_story",
    view,
  },
};

export const FirstRowSelected: Story = {
  args: {
    ...WithNoteAndGoogleUpdate.args,
    initialSelected: "sig_note",
  },
};

export const LastRowSelected: Story = {
  args: {
    ...WithNoteAndGoogleUpdate.args,
    initialSelected: "google:XhUD",
  },
};
