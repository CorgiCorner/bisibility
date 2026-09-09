import { updateProfileNameRecord } from "@/lib/account/profile-service";
import { canProjectAction, type ResourceType } from "@/lib/auth/capabilities";
import { sendEmail } from "@/lib/email/send";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireMutableAccountSession } from "./mutable-account-session";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  provider: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.session }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { user: { findUnique: mocks.findUnique, update: mocks.update } },
}));
vi.mock("@/lib/auth/audit", () => ({ requiredPublicAuditId: vi.fn(), writeAudit: vi.fn() }));
vi.mock("@/lib/email/registry", () => ({ resolveEmailProvider: mocks.provider }));
vi.mock("@/lib/ops/notify", () => ({ notifyOps: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("READ_ONLY_DEMO", "1");
  vi.stubEnv("DEMO_USER_ID", "usr_abcdefghijklmnopqrstuvwx");
  vi.stubEnv("DEMO_PROJECT_ID", "prj_abcdefghijklmnopqrstuvwx");
  vi.stubEnv("DEMO_FIXED_OTP", "0");
  vi.stubEnv("ALLOW_INSECURE_FIXED_OTP", "0");
  mocks.session.mockResolvedValue({ user: { id: "demo" } });
});
afterEach(() => vi.unstubAllEnvs());

describe("demo uses existing viewer RBAC and locks the shared account", () => {
  it("keeps project reads but denies mutations and paid-operation capabilities through viewer", () => {
    const resources: ResourceType[] = [
      "keyword",
      "check_schedule",
      "provider_connection",
      "project_defaults",
      "api_key",
      "cloud_import_job",
      "team",
    ];
    for (const resource of resources) {
      expect(canProjectAction("viewer", "read", resource)).toBe(true);
      for (const action of ["create", "update", "delete", "manage"] as const) {
        expect(canProjectAction("viewer", action, resource)).toBe(false);
      }
    }
  });
  it("rejects account actions and the API's shared profile writer before DB writes", async () => {
    await expect(requireMutableAccountSession()).rejects.toThrow("locked");
    await expect(updateProfileNameRecord("demo", "Changed")).rejects.toThrow("locked");
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("cannot send mail even if a delivery provider was configured by mistake", async () => {
    await expect(
      sendEmail({
        category: "transactional",
        to: "demo@example.com",
        subject: "Login",
        html: "code",
        text: "code",
      }),
    ).rejects.toThrow("disabled");
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("preserves ordinary account-action authorization when demo is disabled", async () => {
    vi.stubEnv("READ_ONLY_DEMO", "0");
    expect(await requireMutableAccountSession()).toEqual({ user: { id: "demo" } });
  });
});
