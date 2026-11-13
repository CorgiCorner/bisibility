import { beforeEach, expect, it, vi } from "vitest";
import { setProjectSeoChallengeEnabled } from "./instance-features";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  audit: vi.fn(),
  upsert: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth/instance-admin", () => ({ getInstanceAdminSession: mocks.admin }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue(null);
  mocks.transaction.mockImplementation(async (run) =>
    run({ instanceSetting: { upsert: mocks.upsert } }),
  );
});

it("rejects a project member who is not an instance admin", async () => {
  await expect(setProjectSeoChallengeEnabled(true)).resolves.toEqual({ ok: false });
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it.each([true, false])("persists and audits the admin's explicit choice %s", async (enabled) => {
  mocks.admin.mockResolvedValue({ user: { id: "admin" } });
  await expect(setProjectSeoChallengeEnabled(enabled)).resolves.toEqual({ ok: true, enabled });
  const key = "projectSeoChallenge.enabled";
  expect(mocks.upsert).toHaveBeenCalledWith({
    create: { key, value: String(enabled) },
    update: { value: String(enabled) },
    where: { key },
  });
  expect(mocks.audit).toHaveBeenCalledWith(
    expect.objectContaining({ actorId: "admin", targetId: key, after: { enabled } }),
    expect.anything(),
  );
});
