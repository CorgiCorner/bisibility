import { ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkSelectedPageVitalsAction, checkSiteAuditVitalsAction } from "./page-vitals";

const mocks = vi.hoisted(() => ({
  actor: { id: "user_1" },
  check: vi.fn(),
  decrypt: vi.fn(),
  listAudits: vi.fn(),
  prisma: {
    projectPage: { findMany: vi.fn() },
    providerConnection: { findFirst: vi.fn() },
  },
  readAudit: vi.fn(),
  record: vi.fn(),
  requireScope: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/activity/app-mutation", () => ({ recordAppAction: mocks.record }));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/pagespeed/check", () => ({
  auditTargets: (domain: string, pages: { url: string }[]) =>
    pages.map((page) => ({ path: "/", url: page.url || `https://${domain}/` })),
  checkPageVitals: mocks.check,
  selectedTargets: (_domain: string, pages: { id: string; path: string }[]) =>
    pages.map((page) => ({
      pageId: page.id,
      path: page.path,
      url: `https://example.com${page.path}`,
    })),
}));
vi.mock("@/lib/providers/crypto", () => ({ decryptProviderCredentials: mocks.decrypt }));
vi.mock("@/lib/site-audit/service", () => ({
  listSiteAudits: mocks.listAudits,
  readSiteAudit: mocks.readAudit,
}));
vi.mock("./_shared", () => ({
  getActionActor: vi.fn(async () => mocks.actor),
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  requireProjectScope: mocks.requireScope,
}));

describe("page vitals actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireScope.mockResolvedValue({
      domain: "example.com",
      id: "project_1",
      publicId: "prj_1",
    });
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({ credentialsEncrypted: "saved" });
    mocks.decrypt.mockReturnValue({ apiKey: "test-key" });
    mocks.listAudits.mockResolvedValue([{ id: "report_1" }]);
    mocks.readAudit.mockResolvedValue({ result: { pages: [{ url: "https://example.com/" }] } });
    mocks.prisma.projectPage.findMany.mockResolvedValue([{ id: "page_1", path: "/docs" }]);
    mocks.check.mockResolvedValue({ checked: 2, code: "ok" });
  });

  it("audits a site-audit check and records activity", async () => {
    const result = await checkSiteAuditVitalsAction({ projectId: "prj_1" });
    expect(result).toEqual({ checked: 2, ok: true });
    expect(mocks.requireScope).toHaveBeenCalledWith(mocks.actor, "create", "prj_1", {
      type: "project",
    });
    expect(mocks.record).toHaveBeenCalledWith(mocks.actor);
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "page_vitals.check",
        after: { checked: 2, code: "ok", scope: "audit" },
      }),
    );
    expect(mocks.check).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "test-key" }));
  });

  it("returns a clear error when PageSpeed is not connected", async () => {
    mocks.prisma.providerConnection.findFirst.mockResolvedValue(null);
    const result = await checkSelectedPageVitalsAction({ paths: ["/docs"], projectId: "prj_1" });
    expect(result).toEqual({ checked: 0, code: "not_connected", ok: false });
    expect(mocks.check).not.toHaveBeenCalled();
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ after: expect.objectContaining({ code: "not_connected" }) }),
    );
  });

  it("returns the quota result from the checker", async () => {
    mocks.check.mockResolvedValue({ checked: 1, code: "quota" });
    const result = await checkSiteAuditVitalsAction({ projectId: "prj_1" });
    expect(result).toEqual({ checked: 1, code: "quota", ok: false });
  });

  it("refuses a read-only project before any check", async () => {
    mocks.requireScope.mockResolvedValue({
      domain: "example.com",
      id: "project_1",
      publicId: "prj_1",
      writeMode: "migrated",
    });
    await expect(checkSiteAuditVitalsAction({ projectId: "prj_1" })).rejects.toBeInstanceOf(
      ProjectReadOnlyError,
    );
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("rejects a viewer because the scope check fails", async () => {
    mocks.requireScope.mockRejectedValue(new Error("forbidden"));
    await expect(
      checkSelectedPageVitalsAction({ paths: ["/docs"], projectId: "prj_1" }),
    ).rejects.toThrow("forbidden");
  });

  it("rejects more than 25 selected paths", async () => {
    const paths = Array.from({ length: 26 }, (_, index) => `/p-${index}`);
    await expect(checkSelectedPageVitalsAction({ paths, projectId: "prj_1" })).rejects.toThrow();
    expect(mocks.check).not.toHaveBeenCalled();
  });
});
