import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { disconnectedChallengeBody, sampleChallengeBody } from "@/lib/challenge-report/fixtures";
import type { ChallengeTileId } from "@/lib/challenge-report/tile-state";
import workspace from "@/messages/core/en/agent-workspace.json";
import messages from "@/messages/core/en/challenge-report.json";
import shared from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";
import { ChallengeReportScreen } from "./ChallengeReportScreen";
import { ChallengeReportView, type ChallengeReportViewBody } from "./ChallengeReportView";

const catalog = { ...shared, ...workspace, ...messages };

function Frame({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <FeatureMessagesProvider locale="en" messages={catalog} timeZone="UTC">
      {children}
    </FeatureMessagesProvider>
  );
}

const meta = {
  component: ChallengeReportView,
  decorators: [
    (Story) => (
      <Frame>
        <Story />
      </Frame>
    ),
  ],
  title: "Reports/Challenge report",
} satisfies Meta<typeof ChallengeReportView>;

export default meta;

type Story = StoryObj<typeof meta>;

function withTiles(ids: readonly ChallengeTileId[]): ChallengeReportViewBody {
  const body = sampleChallengeBody();
  const tiles = Object.fromEntries(
    ids.map((id) => [id, body.tiles[id]]),
  ) as ChallengeReportViewBody["tiles"];
  return { ...body, tiles };
}

export const EightTiles: Story = {
  args: { body: sampleChallengeBody() },
};

export const SixTiles: Story = {
  args: {
    body: withTiles(["clicks", "aiAnswers", "top10", "conversions", "topPages", "cost"]),
  },
};

export const ThreeTiles: Story = {
  args: { body: withTiles(["clicks", "top10", "cost"]) },
};

export const AllTiles: Story = {
  args: { body: sampleChallengeBody() },
};

export const NotConnected: Story = {
  args: { body: disconnectedChallengeBody() },
};

export const Draft: Story = {
  args: { body: sampleChallengeBody() },
  render: () => (
    <ChallengeReportScreen
      body={sampleChallengeBody()}
      canEditLessons
      projectId="prj_abcdefghijklmnopqrstuvwx"
      reportId="agr_abcdefghijklmnopqrstuvwx"
      saveLessonsAction={async () => ({ ok: true })}
    />
  ),
};
