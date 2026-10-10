import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import reportMessages from "@/messages/core/en/agent-workspace.json";
import trackingMessages from "@/messages/core/en/project-ai-tracking.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { AiTrackingWorkspace } from "./AiTrackingWorkspace";
import {
  trackingFixtureActions,
  trackingSampleFixtures,
  trackingWorkspaceFixture,
} from "./fixtures";
import {
  oversizedGenerationActions,
  staleGenerationActions,
  unknownGenerationActions,
} from "./generation-fixtures";
import {
  boundedTrackingActions,
  pagedTrackingActions,
  pagedTrackingFixture,
} from "./history-fixtures";
import { TrackingAuditReportFixture } from "./TrackingAuditReportFixture";

const meta = {
  title: "AI Tracking/Workspace",
  component: AiTrackingWorkspace,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        messages={{ ...sharedMessages, ...trackingMessages, ...reportMessages }}
        timeZone="UTC"
      >
        <Story />
      </FeatureMessagesProvider>
    ),
  ],
  parameters: { layout: "padded" },
  args: { initialData: trackingWorkspaceFixture, actions: trackingFixtureActions },
} satisfies Meta<typeof AiTrackingWorkspace>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Prompts: Story = {};
export const Empty: Story = {
  args: {
    initialData: { ...trackingWorkspaceFixture, topics: [], prompts: [], runs: [], schedules: [] },
  },
};
export const Viewer: Story = {
  args: { initialData: { ...trackingWorkspaceFixture, canWrite: false } },
};
export const History: Story = {
  args: { initialTab: "runs", initialSamples: trackingSampleFixtures },
};
export const DisabledSchedule: Story = { args: { initialTab: "schedules" } };
export const EvidenceAuditReport: Story = { render: () => <TrackingAuditReportFixture /> };

export const BlockedPreview: Story = {
  args: {
    actions: {
      ...trackingFixtureActions,
      preview: async () => {
        throw new Error("Connect an enabled own provider credential before tracking.");
      },
    },
  },
};
export const LoadingPreview: Story = {
  args: { actions: { ...trackingFixtureActions, preview: async () => new Promise(() => {}) } },
};
export const MutationError: Story = {
  args: {
    actions: {
      ...trackingFixtureActions,
      save: async () => {
        throw new Error("Project is read-only. Your changes were not saved.");
      },
    },
  },
};

export const PagedHistory: Story = {
  args: { initialTab: "runs", initialData: pagedTrackingFixture, actions: pagedTrackingActions },
};
export const BoundedExport: Story = {
  args: { initialTab: "runs", actions: boundedTrackingActions },
};
export const GenerationOversized: Story = {
  args: { actions: { ...trackingFixtureActions, generation: oversizedGenerationActions } },
};
export const GenerationStale: Story = {
  args: { actions: { ...trackingFixtureActions, generation: staleGenerationActions } },
};
export const GenerationUnknown: Story = {
  args: { actions: { ...trackingFixtureActions, generation: unknownGenerationActions } },
};
export const GenerationUnavailable: Story = {
  args: {
    actions: {
      ...trackingFixtureActions,
      generation: {
        ...unknownGenerationActions,
        review: async () => {
          throw new Error(
            "Project context is temporarily unavailable. Try again after access is restored.",
          );
        },
      },
    },
  },
};
