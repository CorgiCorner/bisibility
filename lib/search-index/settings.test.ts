import { propertyQuotaKey } from "@/lib/presence/property-quota";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPageIndexingSettings, updatePageIndexingSettings } from "./settings";

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  upsert: vi.fn(),
  quota: vi.fn(),
  project: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/deployment/deployment", () => ({ isSelfHost: false }));
vi.mock("./service", () => ({
  connectionForProject: async () => ({
    property: "sc-domain:example.com",
    credentials: { apiKey: "fixture", login: "sc-domain:example.com" },
  }),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    projectDefaults: { findUnique: mocks.find, upsert: mocks.upsert },
    project: { findUniqueOrThrow: mocks.project },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({ projectDefaults: { findUnique: mocks.find, upsert: mocks.upsert } }),
  },
}));
vi.mock("@/lib/presence/property-quota", async (original) => ({
  ...(await original<typeof import("@/lib/presence/property-quota")>()),
  readPropertyQuota: mocks.quota,
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.find.mockResolvedValue({
    inspectionBudgetMode: "available_quota",
    inspectionDailyLimit: 50,
  });
  mocks.quota.mockResolvedValue({ todayCount: 0 });
  mocks.project.mockResolvedValue({ publicId: "prj_test" });
  mocks.upsert.mockResolvedValue({
    inspectionDailyLimit: 50,
    inspectionBudgetMode: "available_quota",
  });
});
describe("Cloud Page indexing modes", () => {
  it("retains available quota and lists all modes on Cloud", async () => {
    expect(await getPageIndexingSettings("project")).toMatchObject({
      budgetMode: "available_quota",
      availableModes: ["off", "fixed", "available_quota"],
    });
    expect(mocks.quota).toHaveBeenCalledWith(
      propertyQuotaKey("sc-domain:example.com"),
      expect.any(Date),
    );
  });
  it("accepts available quota on Cloud and writes the audited setting", async () => {
    expect(
      await updatePageIndexingSettings("project", { budget_mode: "available_quota" }, "actor"),
    ).toMatchObject({ budgetMode: "available_quota" });
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { inspectionBudgetMode: "available_quota" } }),
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "actor",
        after: { inspectionDailyLimit: 50, inspectionBudgetMode: "available_quota" },
      }),
      expect.anything(),
    );
  });
});
