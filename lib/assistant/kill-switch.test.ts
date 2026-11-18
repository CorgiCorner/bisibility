import { expect, test, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
const audit = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: audit }));

import {
  ASSISTANT_KILL_SWITCH_LEVELS,
  assertAssistantNotKilled,
  HOSTED_OFF_LEVEL,
  KILL_SWITCH_RANK,
  killSwitchRefusal,
  killSwitchStops,
  parseKillSwitch,
  raiseKillSwitch,
} from "./kill-switch";

test("level hosted_off pauses only platform-key turns; level all_off pauses every turn", () => {
  expect(killSwitchRefusal("on", "credits")).toBeNull();
  expect(killSwitchRefusal("hosted_off", "credits")).toBe("credits_paused");
  expect(killSwitchRefusal("hosted_off", "byok")).toBeNull();
  expect(killSwitchRefusal("all_off", "byok")).toBe("assistant_paused");
  expect(killSwitchRefusal("all_off", "credits")).toBe("assistant_paused");
});

test("hosted_off covers platform LLM keys only, as one scope check", () => {
  expect(killSwitchStops("on", "platform_llm")).toBe(false);
  expect(killSwitchStops("hosted_off", "platform_llm")).toBe(true);
  expect(killSwitchStops("all_off", "platform_llm")).toBe(true);
});

test("levels rank on < hosted_off < all_off and HOSTED_OFF_LEVEL is hosted_off", () => {
  expect(KILL_SWITCH_RANK.on).toBeLessThan(KILL_SWITCH_RANK.hosted_off);
  expect(KILL_SWITCH_RANK.hosted_off).toBeLessThan(KILL_SWITCH_RANK.all_off);
  expect(
    [...ASSISTANT_KILL_SWITCH_LEVELS].sort((a, b) => KILL_SWITCH_RANK[a] - KILL_SWITCH_RANK[b]),
  ).toEqual(["on", "hosted_off", "all_off"]);
  expect(HOSTED_OFF_LEVEL).toBe("hosted_off");
});

test("a missing setting means on", () => {
  expect(parseKillSwitch(undefined)).toBe("on");
  expect(parseKillSwitch(null)).toBe("on");
});

test("legacy stored names keep their meaning after the rename", () => {
  expect(parseKillSwitch("off")).toBe("on");
  expect(parseKillSwitch("credits")).toBe("hosted_off");
  expect(parseKillSwitch("all")).toBe("all_off");
});

test("an unknown stored value fails closed to all_off", () => {
  expect(parseKillSwitch("panic")).toBe("all_off");
  expect(parseKillSwitch("")).toBe("all_off");
  expect(parseKillSwitch("OFF")).toBe("all_off");
  expect(parseKillSwitch("ON")).toBe("all_off");
  expect(parseKillSwitch("toString")).toBe("all_off");
  expect(parseKillSwitch("__proto__")).toBe("all_off");
  for (const level of ASSISTANT_KILL_SWITCH_LEVELS) expect(parseKillSwitch(level)).toBe(level);
});

const client = (value: string | null) => ({
  instanceSetting: {
    findUnique: async () => (value === null ? null : { value }),
    upsert: vi.fn(async () => ({})),
  },
  auditLog: {},
});

test("a turn is refused from the stored setting before anything is reserved", async () => {
  await expect(
    assertAssistantNotKilled("credits", client("hosted_off") as never),
  ).rejects.toMatchObject({
    code: "credits_paused",
    status: 503,
  });
  await expect(
    assertAssistantNotKilled("byok", client("hosted_off") as never),
  ).resolves.toBeUndefined();
  await expect(assertAssistantNotKilled("byok", client(null) as never)).resolves.toBeUndefined();
  await expect(assertAssistantNotKilled("byok", client("corrupt") as never)).rejects.toMatchObject({
    code: "assistant_paused",
  });
});

const meta = { action: "test.raise", actorId: null, after: { why: "test" } };

test("raising moves the switch up, audits the change and reports the previous level", async () => {
  audit.mockClear();
  const tx = client(null);
  await expect(raiseKillSwitch(tx as never, "hosted_off", meta)).resolves.toEqual({
    changed: true,
    previous: "on",
    state: "hosted_off",
  });
  expect(tx.instanceSetting.upsert).toHaveBeenCalledWith({
    create: { key: "assistant.killSwitch", value: "hosted_off" },
    update: { value: "hosted_off" },
    where: { key: "assistant.killSwitch" },
  });
  expect(audit).toHaveBeenCalledWith(
    {
      action: "test.raise",
      actorId: null,
      before: { level: "on" },
      after: { level: "hosted_off", why: "test" },
      targetId: "assistant.killSwitch",
      targetType: "instance_ops",
    },
    tx,
  );
  const fromHostedOff = client("hosted_off");
  await expect(raiseKillSwitch(fromHostedOff as never, "all_off", meta)).resolves.toEqual({
    changed: true,
    previous: "hosted_off",
    state: "all_off",
  });
});

test("raising never lowers or rewrites a level at or above the target", async () => {
  audit.mockClear();
  for (const [stored, target] of [
    ["all_off", "hosted_off"],
    ["all_off", "all_off"],
    ["hosted_off", "hosted_off"],
    ["hosted_off", "on"],
    ["on", "on"],
  ] as const) {
    const tx = client(stored);
    await expect(raiseKillSwitch(tx as never, target, meta)).resolves.toEqual({
      changed: false,
      previous: stored,
      state: stored,
    });
    expect(tx.instanceSetting.upsert).not.toHaveBeenCalled();
  }
  expect(audit).not.toHaveBeenCalled();
});
