import { baseData } from "@/components/admin/admin-dashboard-test-fixtures";
import type { AdminPageData } from "@/lib/instance-admin/page-data";
import { recoveryViewFixture } from "@/lib/metering/recovery/view-fixture";
export const account = {
  id: "usr_example",
  email: "operator@example.test",
  status: "active" as const,
  created: "2026-11-01T00:00:00Z",
  lastActive: "2026-11-05T00:00:00Z",
  projects: 7,
  keywords: 19,
  connections: "gsc: 2",
};
export const fixture: Required<AdminPageData> = {
  operations: {
    data: baseData,
    emailAllowance: {
      asOf: "2026-11-05T00:00:00Z",
      day: "2026-11-05T00:00:00Z",
      resetsAt: "2026-11-06T00:00:00Z",
      scope: "installation",
      status: "available",
      categories: [],
    },
  },
  email: {
    allowance: {
      asOf: "2026-11-05T00:00:00Z",
      day: "2026-11-05T00:00:00Z",
      resetsAt: "2026-11-06T00:00:00Z",
      scope: "installation",
      status: "available",
      categories: [],
    },
  },
  accounts: {
    account: null,
    accounts: [account],
    accountTotalCount: 51,
    filteredCount: 26,
    page: 1,
    pageSize: 25,
    pageCount: 2,
    twoFactorEnabled: true,
  },
  settings: {
    account: null,
    mailSettings: {
      credentialsConfigured: false,
      envOverridesSaved: false,
      hasPasswordCredential: false,
      provider: "smtp",
      sender: "",
      twoFactorEnabled: true,
    },
    mailerConfigured: false,
    twoFactorEnabled: true,
  },
  tasks: { page: recoveryViewFixture(), twoFactorEnabled: true },
  audit: {
    initialFilter: "all",
    entries: [
      {
        id: "audit_1",
        time: "2026-11-05T00:00:00Z",
        actor: "operator@example.test",
        action: "instance_admin.account_deactivated",
        target: "usr_example",
        targetType: "user",
        result: "ok",
        category: "account",
      },
    ],
    nextCursor: "older",
  },
};
