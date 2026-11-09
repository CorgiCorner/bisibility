import { dashboard, operations, type Story, sampleData } from "./oss-story-fixtures-1";
import { requireFixture } from "./require-fixture";
export const WorkerAhead: Story = {
  args: {
    data: {
      ...sampleData,
      operations: {
        ...operations,
        data: { ...dashboard, worker: { ...dashboard.worker, schemaComparison: "worker-ahead" } },
      },
    },
  },
};

export const WorkerSchemaUnknown: Story = {
  args: {
    data: {
      ...sampleData,
      operations: {
        ...operations,
        data: { ...dashboard, worker: { ...dashboard.worker, schemaComparison: "unknown" } },
      },
    },
  },
};

export const OpsUnconfigured: Story = {
  args: {
    initialTab: "Operations",
    initialView: "Notifications",
    data: {
      ...sampleData,
      operations: {
        ...operations,
        data: { ...dashboard, ops: { ...dashboard.ops, configured: false } },
      },
    },
  },
};

export const OpsPending: Story = {
  args: {
    initialTab: "Operations",
    initialView: "Notifications",
    data: {
      ...sampleData,
      operations: {
        ...operations,
        onSendTest: () => new Promise<undefined>(() => {}),
        onRunSweep: () => new Promise<undefined>(() => {}),
      },
    },
  },
};

export const Audit: Story = { args: { initialTab: "Audit", initialView: "Audit" } };

export const OperationsLoading: Story = {
  args: { loading: "operations", refresh: { onRefresh: () => {}, refreshing: true } },
};

export const AdministrationLoading: Story = {
  args: {
    initialTab: "Users",
    initialView: "Accounts",
    loading: "administration",
    refresh: { onRefresh: () => {}, refreshing: true },
  },
};

export const recovery = requireFixture(sampleData.recovery);

export const RecoveryDetail: Story = {
  args: {
    initialTab: "Operations",
    initialView: "Tasks",
    data: { ...sampleData, recovery: { ...recovery, initialDetail: recovery.page.rows[0] } },
  },
};

export const RecoveryBatch: Story = {
  args: {
    initialTab: "Operations",
    initialView: "Tasks",
    data: {
      ...sampleData,
      recovery: {
        ...recovery,
        initialDialogOpen: true,
        preview: {
          token: "sample",
          expiresAt: "2026-11-03T10:00:00Z",
          eligible: [{ caseToken: "case-result", action: "restore_result" }],
          excluded: [],
          newPaidAttempts: 0,
          providerCalls: 0,
          originalRuns: 0,
        },
        now: Date.parse("2026-11-01T00:00:00Z"),
      },
    },
  },
};

export const Polish: Story = {
  globals: { locale: "pl" },
  args: { refresh: { onRefresh: () => {} } },
};

export const AuditLoading: Story = {
  args: {
    initialTab: "Audit",
    initialView: "Audit",
    loading: "audit",
    refresh: { onRefresh: () => {}, refreshing: true },
  },
};

export const account = {
  id: "user-1",
  email: "sample@example.com",
  status: "active" as const,
  created: "1 Oct 2026",
  lastActive: "29 Oct 2026",
  projects: 2,
  keywords: 14,
  connections: "SERP: 1",
};

export const adminProps = requireFixture(sampleData.administration);

export const Administration: Story = {
  args: {
    initialTab: "Users",
    initialView: "Accounts",
    data: { ...sampleData, administration: { ...adminProps, accounts: [account], account } },
  },
};

export const EmailSettings: Story = {
  args: { ...Administration.args, initialTab: "Email", initialView: "Settings" },
};

export const ReactivateAccount: Story = {
  args: {
    ...Administration.args,
    data: {
      ...sampleData,
      administration: { ...adminProps, account: { ...account, status: "deactivated" } },
    },
  },
};

export const LookupRateLimit: Story = {
  args: {
    ...Administration.args,
    data: {
      ...sampleData,
      administration: { ...adminProps, error: "Too many account lookups. Try again shortly." },
    },
  },
};

export const adminOutcome = (
  result: NonNullable<Awaited<ReturnType<NonNullable<typeof adminProps.onAccountAction>>>>,
  deactivated = false,
): Story => ({
  args: {
    ...Administration.args,
    data: {
      ...sampleData,
      administration: {
        ...adminProps,
        account: { ...account, status: deactivated ? "deactivated" : "active" },
        onAccountAction: () => result,
      },
    },
  },
});

export const AccountDeactivated = adminOutcome({
  status: "completed",
  accountStatus: "deactivated",
  message: "",
});

export const AccountReactivated = adminOutcome(
  { status: "completed", accountStatus: "active", message: "" },
  true,
);

export const AccountBlocked = adminOutcome({ status: "blocked", message: "" });
