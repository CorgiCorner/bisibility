import { propertyQuotaKey } from "@/lib/presence/property-quota";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPageIndexingSettings, updatePageIndexingSettings } from "./settings";

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  upsert: vi.fn(),
  quota: vi.fn(),
}));
vi.mock("@/lib/deployment/deployment", () => ({ isSelfHost: false }));
vi.mock("./service", () => ({
  connectionForProject: async () => ({
    property: "sc-domain:example.com",
    credentials: { apiKey: "fixture", login: "sc-domain:example.com" },
  }),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { projectDefaults: { findUnique: mocks.find, upsert: mocks.upsert } },
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
});
describe("Cloud Page indexing modes", () => {
  it("treats an imported available quota mode as fixed and lists only supported modes", async () => {
    expect(await getPageIndexingSettings("project")).toMatchObject({
      budgetMode: "fixed",
      availableModes: ["off", "fixed"],
    });
    expect(mocks.quota).toHaveBeenCalledWith(
      propertyQuotaKey("sc-domain:example.com"),
      expect.any(Date),
    );
  });
  it("rejects available quota before any write", async () => {
    await expect(
      updatePageIndexingSettings("project", { budget_mode: "available_quota" }, null),
    ).rejects.toThrow("self-host");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
