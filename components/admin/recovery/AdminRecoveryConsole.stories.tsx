import { withRecoveryMessages } from "@/.storybook/recovery-messages";
import { evidenceRecoveryFixture } from "@/lib/metering/recovery/evidence-view-fixture";
import { recoveryViewFixture } from "@/lib/metering/recovery/view-fixture";
import type { Meta, StoryObj } from "@storybook/react";
import { AdminRecoveryConsole } from "./AdminRecoveryConsole";

const meta = {
  title: "Admin/Task recovery",
  component: AdminRecoveryConsole,
  decorators: [withRecoveryMessages],
} satisfies Meta<typeof AdminRecoveryConsole>;
export default meta;
type Story = StoryObj<typeof meta>;
export const MixedCases: Story = { args: { initial: recoveryViewFixture() } };
export const Unavailable: Story = { args: { initial: null } };
export const Polish: Story = {
  args: { initial: recoveryViewFixture() },
  globals: { locale: "pl" },
};
export const Empty: Story = {
  args: {
    initial: {
      ...recoveryViewFixture(),
      rows: [],
      summary: {
        unconfirmed: 0,
        overdue: 0,
        historical: 0,
        failed: 0,
        unfinished: 0,
        retainedResults: 0,
        lastActivityAt: null,
        lastCompletedAt: null,
        lastCleanAt: null,
      },
    },
  },
};

export const UnderReview: Story = { args: { initial: evidenceRecoveryFixture() } };
export const RecoveredUnknownCost: Story = {
  args: { initial: evidenceRecoveryFixture("recovered", "unknown") },
};
export const Partial: Story = { args: { initial: evidenceRecoveryFixture("partial", "measured") } };
export const ProviderError: Story = {
  args: { initial: evidenceRecoveryFixture("provider_error", "measured") },
};
export const Missing: Story = { args: { initial: evidenceRecoveryFixture("missing", "unknown") } };
export const CostConflict: Story = {
  args: { initial: evidenceRecoveryFixture("recovered", "conflict") },
};
export const ReopenedIncident: Story = { args: { initial: evidenceRecoveryFixture() } };
export const PartialUnresolvedList: Story = {
  args: { initial: { ...evidenceRecoveryFixture(), rows: [] } },
};

export const ClosedWithUnknownCost: Story = {
  args: {
    initial: {
      ...recoveryViewFixture(),
      summary: {
        ...recoveryViewFixture().summary,
        unfinished: 0,
        unconfirmed: 0,
        overdue: 0,
        historical: 0,
        closedUnknown: 12,
        failed: 0,
        retainedResults: 0,
        blockedScopes: { projects: 0, connections: 0 },
      },
      rows: [
        {
          ...recoveryViewFixture().rows[0],
          historical: false,
          closedUnknown: true,
          send: "possibly_sent",
          accounting: "unknown",
          work: "stopped",
          action: null,
          blockedReason: null,
        },
      ],
    },
  },
};
