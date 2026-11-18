import { beforeEach, expect, it, vi } from "vitest";
import { setAssistantGuard, setAssistantKillSwitch } from "./assistant-kill-switch";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  audit: vi.fn(),
  upsert: vi.fn(),
  find: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth/instance-admin", () => ({ getInstanceAdminSession: mocks.admin }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue(null);
  mocks.find.mockResolvedValue({ value: "on" });
  mocks.transaction.mockImplementation(async (run) =>
    run({
      instanceSetting: {
        upsert: mocks.upsert,
        findUnique: mocks.find,
        findMany: async () => [{ key: "assistant.guard.teamDailyCents", value: "1000" }],
      },
    }),
  );
});

it("refuses anyone who is not an instance admin and changes nothing", async () => {
  await expect(setAssistantKillSwitch("all_off", "Provider incident")).resolves.toEqual({
    ok: false,
  });
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it("refuses an unknown level", async () => {
  mocks.admin.mockResolvedValue({ user: { id: "admin" } });
  await expect(setAssistantKillSwitch("everything" as never, "Provider incident")).resolves.toEqual(
    { ok: false },
  );
  expect(mocks.upsert).not.toHaveBeenCalled();
});

it("refuses a flip without a usable reason and changes nothing", async () => {
  mocks.admin.mockResolvedValue({ user: { id: "admin" } });
  for (const reason of ["", "   \n\t ", "x".repeat(501), undefined, 42]) {
    await expect(setAssistantKillSwitch("all_off", reason as never)).resolves.toEqual({
      ok: false,
    });
  }
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(mocks.upsert).not.toHaveBeenCalled();
  expect(mocks.audit).not.toHaveBeenCalled();
});

it("accepts a reason of up to 500 characters after trimming", async () => {
  mocks.admin.mockResolvedValue({ user: { id: "admin" } });
  const longest = "y".repeat(500);
  await expect(setAssistantKillSwitch("all_off", `  ${longest}  `)).resolves.toEqual({
    ok: true,
    level: "all_off",
  });
  expect(mocks.audit).toHaveBeenCalledWith(
    expect.objectContaining({ after: { level: "all_off", reason: longest } }),
    expect.anything(),
  );
});

it("stores the level and audits the flip with before, after and the trimmed reason", async () => {
  mocks.admin.mockResolvedValue({ user: { id: "admin" } });
  await expect(setAssistantKillSwitch("hosted_off", "  Provider incident  ")).resolves.toEqual({
    ok: true,
    level: "hosted_off",
  });
  const key = "assistant.killSwitch";
  expect(mocks.upsert).toHaveBeenCalledWith({
    create: { key, value: "hosted_off" },
    update: { value: "hosted_off" },
    where: { key },
  });
  expect(mocks.audit).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "instance_admin.assistant_kill_switch.set",
      actorId: "admin",
      before: { level: "on" },
      after: { level: "hosted_off", reason: "Provider incident" },
    }),
    expect.anything(),
  );
});

it("turning a paused switch off also restarts the breaker windows; other flips do not", async () => {
  mocks.admin.mockResolvedValue({ user: { id: "admin" } });
  mocks.find.mockResolvedValue({ value: "hosted_off" });
  await setAssistantKillSwitch("on", "Incident resolved");
  expect(mocks.upsert).toHaveBeenCalledWith(
    expect.objectContaining({ where: { key: "assistant.breaker.resetAt" } }),
  );
  mocks.upsert.mockClear();
  mocks.find.mockResolvedValue({ value: "on" });
  await setAssistantKillSwitch("hosted_off", "Provider incident");
  expect(mocks.upsert).toHaveBeenCalledTimes(1);
});

it("changes a spending guard for an admin only, with a valid key and value, and audits it", async () => {
  await expect(setAssistantGuard("assistant.guard.teamDailyCents", "500")).resolves.toEqual({
    ok: false,
  });
  mocks.admin.mockResolvedValue({ user: { id: "admin" } });
  await expect(setAssistantGuard("assistant.guard.teamDailyCents", "0")).resolves.toEqual({
    ok: false,
  });
  await expect(setAssistantGuard("assistant.killSwitch" as never, "5")).resolves.toEqual({
    ok: false,
  });
  expect(mocks.upsert).not.toHaveBeenCalled();
  await expect(setAssistantGuard("assistant.guard.teamDailyCents", "500")).resolves.toEqual({
    ok: true,
    key: "assistant.guard.teamDailyCents",
    value: 500,
  });
  expect(mocks.upsert).toHaveBeenCalledWith({
    create: { key: "assistant.guard.teamDailyCents", value: "500" },
    update: { value: "500" },
    where: { key: "assistant.guard.teamDailyCents" },
  });
  expect(mocks.audit).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "instance_admin.assistant_guard.set",
      before: { key: "assistant.guard.teamDailyCents", value: 1000 },
      after: { key: "assistant.guard.teamDailyCents", value: 500 },
    }),
    expect.anything(),
  );
});
