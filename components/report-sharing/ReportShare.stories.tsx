import { ChallengeReportView } from "@/components/challenge-report/ChallengeReportView";
import { ReportRoundProvider } from "@/components/challenge-report/report-figures";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { sampleChallengeBody } from "@/lib/challenge-report/fixtures";
import type { ReportShareSummary } from "@/lib/report-sharing/model";
import { publicReportView } from "@/lib/report-sharing/projection";
import { defaultShareSettings, parseShareSettings } from "@/lib/report-sharing/settings";
import workspace from "@/messages/core/en/agent-workspace.json";
import messages from "@/messages/core/en/challenge-report.json";
import shared from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";
import { PublicReportScreen } from "./PublicReportScreen";
import { ReportShareDialog } from "./ReportShareDialog";

const catalog = { ...shared, ...workspace, ...messages };
const projectId = "prj_abcdefghijklmnopqrstuvwx";

function Frame({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <FeatureMessagesProvider locale="en" messages={catalog} timeZone="UTC">
      {children}
    </FeatureMessagesProvider>
  );
}

function summary(overrides: Partial<ReportShareSummary> = {}): ReportShareSummary {
  return {
    access: "members",
    expires: "never",
    memberCount: 4,
    ownerIsViewer: true,
    ownerName: "Ada",
    pending: null,
    reportId: "agr_abcdefghijklmnopqrstuvwx",
    settings: defaultShareSettings(),
    teamHref: `/app/${projectId}/settings/team`,
    views7d: 12,
    ...overrides,
  };
}

const meta = {
  component: ReportShareDialog,
  decorators: [
    (Story) => (
      <Frame>
        <Story />
      </Frame>
    ),
  ],
  title: "Reports/Share",
} satisfies Meta<typeof ReportShareDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Private: Story = {
  args: {
    canEdit: true,
    onClose: () => undefined,
    open: true,
    projectId,
    summary: summary(),
    title: "30 days of SEO",
  },
};

export const Public: Story = {
  args: {
    ...Private.args,
    summary: summary({ access: "link" }),
  },
};

export const PublishUpdate: Story = {
  args: {
    ...Private.args,
    summary: summary({
      access: "link",
      pending: {
        reportId: "agr_bbbbbbbbbbbbbbbbbbbbbbbb",
        stage: "day60",
        title: "60 days of SEO",
      },
    }),
  },
};

export const PublicPage: StoryObj = {
  render: () => (
    <Frame>
      <PublicReportScreen
        canShare={false}
        domain="example.com"
        reports={[{ id: "agr_abcdefghijklmnopqrstuvwx", stage: "day30" }]}
        title="30 days of SEO"
        token="story-token"
        view={publicReportView(sampleChallengeBody(), defaultShareSettings())}
      />
    </Frame>
  ),
};

export const HiddenTiles: StoryObj = {
  render: () => (
    <Frame>
      <ReportRoundProvider round>
        <ChallengeReportView
          body={publicReportView(
            sampleChallengeBody(),
            parseShareSettings({ showLessons: false, visibleTiles: ["clicks", "conversions"] }),
          )}
          motion={false}
        />
      </ReportRoundProvider>
    </Frame>
  ),
};

export const TwoStages: StoryObj = {
  render: () => (
    <Frame>
      <PublicReportScreen
        canShare
        domain="example.com"
        reports={[
          { id: "agr_bbbbbbbbbbbbbbbbbbbbbbbb", stage: "day60" },
          { id: "agr_abcdefghijklmnopqrstuvwx", stage: "day30" },
        ]}
        title="60 days of SEO"
        token="story-token"
        view={publicReportView(sampleChallengeBody(), defaultShareSettings())}
      />
    </Frame>
  ),
};
