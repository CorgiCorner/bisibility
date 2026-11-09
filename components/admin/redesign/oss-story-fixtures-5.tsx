import {
  baseData,
  disabledTemporal,
  staleTemporal,
  unavailableTemporal,
} from "@/components/admin/admin-dashboard-test-fixtures";
import type { InstanceAdminDashboard } from "@/lib/instance-admin/dashboard-types";
import { useState } from "react";
import { OssAdminComposition } from "./OssAdminComposition";
import type { OssAdminData } from "./OssAdminViews";
import { operations, type Story, sampleData } from "./oss-story-fixtures-1";
import { Administration, Audit, adminProps } from "./oss-story-fixtures-2";
import { overviewParityDashboard, parityAllowance } from "./oss-story-fixtures-4";
export function overviewParity(
  data: InstanceAdminDashboard,
  overrides: Partial<NonNullable<OssAdminData["operations"]>> = {},
): Story {
  if (!operations) throw new Error("Operations fixture is required");
  return { args: { data: { ...sampleData, operations: { ...operations, data, ...overrides } } } };
}

export const OverviewParity = overviewParity(overviewParityDashboard, {
  onSendTest: () => ({ status: "delivered" }),
  onRunSweep: () => ({ status: "completed", attempted: 3, delivered: 2 }),
});

export const OverviewUnavailable = overviewParity({
  ...overviewParityDashboard,
  availability: {
    dataSources: false,
    opsDelivery: false,
    opsEvents: false,
    presence: false,
    rankChecks: false,
    stats: false,
    worker: false,
  },
  temporal: unavailableTemporal,
});

export const OverviewEmpty = overviewParity(baseData);

export const OverviewStale = overviewParity({
  ...overviewParityDashboard,
  temporal: staleTemporal,
});

export const OverviewDisabled = overviewParity({
  ...overviewParityDashboard,
  temporal: disabledTemporal,
});

export const OverviewOpsNotConfigured = overviewParity(overviewParityDashboard, {
  onSendTest: () => ({ status: "not_configured" }),
});

export const OverviewOpsRateLimited = overviewParity(overviewParityDashboard, {
  onSendTest: () => ({ status: "rate_limited" }),
});

export const OverviewOpsFailed = overviewParity(overviewParityDashboard, {
  onSendTest: () => ({ status: "delivery_failed" }),
  onRunSweep: () => ({ status: "failed" }),
});

export const OverviewOpsForbidden = overviewParity(overviewParityDashboard, {
  onSendTest: () => ({ status: "forbidden" }),
});

export function emailParity(
  allowance: NonNullable<OssAdminData["emailAllowance"]>["allowance"],
): Story {
  return {
    args: {
      initialTab: "Email",
      initialView: "Sending today",
      data: { ...sampleData, emailAllowance: { allowance } },
    },
  };
}

export const EmailParity = emailParity(parityAllowance);

export const EmailNotConfigured = emailParity({
  ...parityAllowance,
  status: "not_configured",
  categories: [],
});

export const EmailCountsUnavailable = emailParity({
  ...parityAllowance,
  status: "unavailable",
  categories: parityAllowance.categories.map((category) => ({
    ...category,
    reservedAttempts: null,
    remaining: null,
  })),
});

export const EmailConfigurationUnavailable = emailParity({
  ...parityAllowance,
  status: "unavailable",
  categories: [],
});

export const OverviewOpsThrown = overviewParity(overviewParityDashboard, {
  onRunSweep: () => {
    throw new Error("failed");
  },
});

export const AdministrationBusy: Story = {
  args: {
    ...Administration.args,
    data: { ...sampleData, administration: { ...adminProps, busy: true } },
  },
};

export const AdministrationNotFound: Story = {
  args: {
    ...Administration.args,
    data: { ...sampleData, administration: { ...adminProps, account: null } },
  },
};

export const AdministrationFailed: Story = {
  args: {
    ...Administration.args,
    data: {
      ...sampleData,
      administration: { ...adminProps, account: null, error: "Account lookup failed. Try again." },
    },
  },
};

export const AdministrationForbidden: Story = {
  args: {
    ...Administration.args,
    data: { ...sampleData, administration: { ...adminProps, account: null, isAdmin: false } },
  },
};

export const AccountLookupForbidden: Story = {
  render: (args) => {
    const [error, setError] = useState<string>();
    return (
      <OssAdminComposition
        {...args}
        data={{
          ...sampleData,
          administration: {
            ...adminProps,
            account: null,
            error,
            onLookup: () => setError("Administrator access is no longer available."),
          },
        }}
      />
    );
  },
  args: Administration.args,
};

export const AuditParity: Story = {
  args: {
    ...Audit.args,
    data: {
      ...sampleData,
      audit: {
        entries: [
          {
            id: "1",
            time: "2026-07-17T12:00:00Z",
            actor: "operator",
            action: "Changed setting",
            target: "sample-target",
            result: "ok",
            targetType: "user",
            category: "setup",
          },
          {
            id: "2",
            time: "2026-07-16T12:00:00Z",
            actor: "other",
            action: "Failed action",
            target: "other-target",
            result: "failed",
            targetType: "project",
            category: "ops",
          },
        ],
        nextCursor: "next",
        onNext: () => {},
      },
    },
  },
};
