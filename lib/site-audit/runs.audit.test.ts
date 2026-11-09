import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  audit: vi.fn(),
  budget: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => {
  const tx = {
    siteAuditRun: { findUniqueOrThrow: mocks.get, updateMany: mocks.update },
    auditLog: { create: mocks.audit },
  };
  return {
    prisma: {
      siteAuditRun: { findFirst: mocks.find },
      $transaction: async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    },
  };
});
vi.mock("./report-store", () => ({ saveSiteAuditSummary: vi.fn() }));
vi.mock("./budget-extension", () => ({
  assertSiteAuditOperationAccess: vi.fn(),
  lockSiteAuditAdmission: vi.fn(),
  rememberSiteAuditBudget: vi.fn(),
  resolveSiteAuditBudget: mocks.budget,
  settleSiteAuditCrawl: vi.fn(),
}));
vi.mock("./worker-config", () => ({ siteAuditWorkerEnabled: async () => true }));
vi.mock("@/lib/scheduler/driver", () => ({ schedulerDriver: () => "temporal" }));
vi.mock("@/lib/operations/access-extension", () => ({ assertOperationAccess: vi.fn() }));

import { cancelSiteAuditRun, resumeSiteAuditRun } from "./runs";

const row = {
  id: "run",
  publicId: "agr_abcdefghijklmnopqrstuvwx",
  projectId: "project",
  state: "running",
  generation: 3,
  stopReason: null,
  pagesCrawled: 2,
  budgetPages: 15,
  requests: 3,
  startedAt: null,
  completedAt: null,
};
const attribution = { actorId: null, credentialId: "key-id", credentialKind: "project_key" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.budget.mockResolvedValue({ maxPages: 15, stopReason: "page_budget", priority: 0 });
  mocks.find.mockResolvedValue(row);
  mocks.update.mockResolvedValue({ count: 1 });
  mocks.audit.mockResolvedValue({});
});
it.each([
  ["cancel", cancelSiteAuditRun, "running", "cancelled", 3],
  ["resume", resumeSiteAuditRun, "failed", "queued", 4],
] as const)(
  "audits the %s transition transaction with actor, credential, state and generation",
  async (action, control, before, after, generation) => {
    mocks.get
      .mockResolvedValueOnce({ ...row, state: before })
      .mockResolvedValue({ ...row, state: after, generation });
    await control("project", row.publicId, attribution);
    expect(mocks.audit).toHaveBeenCalledExactlyOnceWith({
      data: expect.objectContaining({
        action: `site_audit.${action}`,
        actorId: null,
        projectId: "project",
        targetType: "site_audit_run",
        targetId: row.publicId,
        before: { state: before, generation: 3 },
        after: { state: after, generation, credentialId: "key-id", credentialKind: "project_key" },
      }),
    });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "run", state: before, generation: 3 }),
      }),
    );
  },
);
it.each([cancelSiteAuditRun, resumeSiteAuditRun])(
  "does not duplicate audit records on no-op or lost transitions",
  async (control) => {
    mocks.get.mockResolvedValue({ ...row, state: "failed" });
    mocks.update.mockResolvedValue({ count: 0 });
    await control("project", row.publicId, { actorId: "member" });
    expect(mocks.audit).not.toHaveBeenCalled();
  },
);
it("propagates an audit write failure so the transaction can roll back", async () => {
  mocks.get.mockResolvedValueOnce(row).mockResolvedValue({ ...row, state: "cancelled" });
  mocks.audit.mockRejectedValue(new Error("audit unavailable"));
  await expect(cancelSiteAuditRun("project", row.publicId, { actorId: "member" })).rejects.toThrow(
    "audit unavailable",
  );
});
