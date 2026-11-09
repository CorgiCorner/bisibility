import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  admin: vi.fn(),
  operations: vi.fn(),
  allowance: vi.fn(),
  mail: vi.fn(),
  refresh: vi.fn(),
  configured: vi.fn(),
  list: vi.fn(),
  facts: vi.fn(),
  audit: vi.fn(),
  recovery: vi.fn(),
  consume: vi.fn(),
  writeAudit: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/auth/instance-admin", () => ({ getInstanceAdminSession: mocks.admin }));
vi.mock("@/lib/queries/instance-admin-operational", () => ({
  getInstanceAdminOperationalData: mocks.operations,
}));
vi.mock("@/lib/email/allowance", () => ({ getInstanceAdminEmailAllowance: mocks.allowance }));
vi.mock("@/lib/email/instance-mail-store", () => ({
  loadInstanceMailSettingsView: mocks.mail,
  refreshInstanceMailRuntime: mocks.refresh,
}));
vi.mock("@/lib/email/registry", () => ({ isEmailConfigured: mocks.configured }));
vi.mock("./oss-account-list", () => ({ readAccountList: mocks.list }));
vi.mock("@/lib/queries/instance-admin-account-facts", () => ({
  loadInstanceAccountFacts: mocks.facts,
}));
vi.mock("@/lib/queries/instance-admin-audit", () => ({ getInstanceAdminAuditPage: mocks.audit }));
vi.mock("@/lib/metering/recovery/service", () => ({ getRecoveryPage: mocks.recovery }));
vi.mock("@/lib/api/ratelimit", () => ({ consume: mocks.consume }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));

import { getOssAccount, getOssAccounts } from "./oss-accounts";
import { getOssAudit } from "./oss-audit";
import { getOssEmailSending, getOssEmailSettings } from "./oss-email";
import {
  getOssChecks,
  getOssDataSources,
  getOssNotifications,
  getOssOverview,
  getOssWorker,
} from "./oss-operations";
import { getOssTasks } from "./oss-tasks";

const builders = [
  getOssOverview,
  getOssWorker,
  getOssChecks,
  getOssDataSources,
  getOssNotifications,
  getOssAccounts,
  () => getOssAccount("a@example.com"),
  getOssEmailSending,
  getOssEmailSettings,
  getOssTasks,
  getOssAudit,
];
const loaders = [
  mocks.operations,
  mocks.allowance,
  mocks.mail,
  mocks.list,
  mocks.facts,
  mocks.audit,
  mocks.recovery,
  mocks.consume,
];
beforeEach(() => {
  vi.resetAllMocks();
  const actor = { user: { id: "admin", twoFactorEnabled: true } };
  mocks.session.mockResolvedValue(actor);
  mocks.admin.mockResolvedValue(actor);
});

describe.each(builders)("OSS builder %s authorization", (builder) => {
  it("returns no data for an unauthenticated request before any reads", async () => {
    mocks.session.mockResolvedValue(null);
    await expect(builder()).resolves.toBeNull();
    expect(mocks.admin).not.toHaveBeenCalled();
    for (const load of loaders) expect(load).not.toHaveBeenCalled();
  });
  it("forbids authenticated non-admins before any reads", async () => {
    mocks.admin.mockResolvedValue(null);
    await expect(builder()).rejects.toMatchObject({ code: "forbidden" });
    for (const load of loaders) expect(load).not.toHaveBeenCalled();
  });
});

it("retains task state and tokens without the original monetary authorization", async () => {
  mocks.recovery.mockResolvedValue({
    rows: [
      {
        token: "case",
        originalAuthorization: { maxCostCents: "123" },
        accounting: "unknown",
        evidence: { projection: { cost: "measured", fulfillment: "partial" } },
      },
    ],
    summary: { unfinished: 1 },
  });
  const result = await getOssTasks();
  expect(result?.page.rows[0]).toEqual({
    token: "case",
    accounting: "unknown",
    evidence: { projection: { cost: null, fulfillment: "partial" } },
  });
  expect(result?.twoFactorEnabled).toBe(true);
});
it("requests an operations-only audit page and maps the exact view fields", async () => {
  mocks.audit.mockResolvedValue({
    entries: [
      {
        id: "log",
        createdAt: "time",
        actorEmail: null,
        action: "instance_admin.first_run_completed",
        targetId: null,
        targetType: "instance_ops",
        result: "ok",
      },
    ],
    nextCursor: "next",
    filter: "setup",
  });
  expect(await getOssAudit({ filter: "setup" })).toEqual({
    initialFilter: "setup",
    entries: [
      {
        id: "log",
        time: "time",
        actor: "-",
        action: "instance_admin.first_run_completed",
        target: "-",
        targetType: "instance_ops",
        result: "ok",
        category: "setup",
      },
    ],
    nextCursor: "next",
  });
  expect(mocks.audit).toHaveBeenCalledWith({ filter: "setup", operationsOnly: true });
});
it("records a failed account lookup without storing the supplied email", async () => {
  mocks.consume.mockResolvedValue({ success: true });
  mocks.facts.mockResolvedValue(null);
  expect(await getOssAccount("Missing@Example.com")).toEqual({
    account: null,
    status: "not_found",
  });
  expect(mocks.writeAudit).toHaveBeenCalledWith(
    expect.objectContaining({
      actorId: "admin",
      action: "instance_admin.account_viewed",
      targetId: expect.stringMatching(/^sha256:/),
      status: "failed",
    }),
  );
});
it("fails closed and audits when the account lookup limiter is unavailable", async () => {
  mocks.consume.mockRejectedValue(new Error("unavailable"));
  expect(await getOssAccount("missing@example.com")).toEqual({ account: null, status: "failed" });
  expect(mocks.facts).not.toHaveBeenCalled();
  expect(mocks.writeAudit).toHaveBeenCalledWith(
    expect.objectContaining({ after: { result: "failed" } }),
  );
});
it("keeps the lookup rate limit and audit for denied requests", async () => {
  mocks.consume.mockResolvedValue({ success: false, resetAt: 0 });
  expect(await getOssAccount("a@example.com")).toMatchObject({ status: "rate_limited" });
  expect(mocks.facts).not.toHaveBeenCalled();
  expect(mocks.writeAudit).toHaveBeenCalledWith(
    expect.objectContaining({ after: { result: "rate_limited" } }),
  );
});
