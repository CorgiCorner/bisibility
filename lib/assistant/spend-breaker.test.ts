import { expect, test, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
const audit = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: audit }));
vi.mock("@/lib/ops/notify", () => ({ notifyOps: vi.fn() }));

import { ASSISTANT_GUARD_DEFAULTS } from "./guard-config";
import { breakerTrip, runAssistantSpendBreaker } from "./spend-breaker";

const config = { ...ASSISTANT_GUARD_DEFAULTS };
const quiet = { hourlyMicro: 0n, dailyMicro: 0n, unsettled: 0 };

test("each cap trips the breaker at its threshold and not below it", () => {
  expect(breakerTrip(quiet, config)).toBeNull();
  expect(breakerTrip({ ...quiet, hourlyMicro: 19_999_999n }, config)).toBeNull();
  expect(breakerTrip({ ...quiet, hourlyMicro: 20_000_000n }, config)?.reason).toBe("hourly_spend");
  expect(breakerTrip({ ...quiet, dailyMicro: 100_000_000n }, config)?.reason).toBe("daily_spend");
  expect(breakerTrip({ ...quiet, unsettled: 24 }, config)).toBeNull();
  expect(breakerTrip({ ...quiet, unsettled: 25 }, config)?.reason).toBe("unsettled_attempts");
});

type Fake = { level: string; resetAt?: string; spend: (since: Date) => bigint; unsettled: number };

function fake(state: Fake) {
  const sinces: Date[] = [];
  const upserts: unknown[] = [];
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      if (sql.includes("pg_advisory_xact_lock")) return [{ acquired: 1 }];
      if (sql.includes("count(*)")) return [{ count: BigInt(state.unsettled) }];
      const since = values.find((value) => value instanceof Date) as Date;
      sinces.push(since);
      return [{ micro: { toFixed: () => state.spend(since).toString() } }];
    },
    instanceSetting: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        where.key === "assistant.killSwitch"
          ? { value: state.level }
          : state.resetAt
            ? { value: state.resetAt }
            : null,
      findMany: async () => [],
      upsert: async (args: unknown) => {
        upserts.push(args);
      },
    },
  };
  const transaction = async <T>(body: (client: never) => Promise<T>) => body(tx as never);
  return { transaction, sinces, upserts };
}

const clock = { now: () => new Date("2026-11-14T20:30:00Z") };

test("hourly spend over the cap pauses Credits, audits without an actor and alerts", async () => {
  audit.mockClear();
  const notify = vi.fn(async () => {});
  const { transaction, upserts } = fake({ level: "on", spend: () => 25_000_000n, unsettled: 0 });
  const result = await runAssistantSpendBreaker({ clock, transaction, notify });
  expect(result.tripped).toMatchObject({ reason: "hourly_spend", hourlyCents: 2500 });
  expect(upserts).toEqual([
    {
      create: { key: "assistant.killSwitch", value: "hosted_off" },
      update: { value: "hosted_off" },
      where: { key: "assistant.killSwitch" },
    },
  ]);
  expect(audit).toHaveBeenCalledWith(
    expect.objectContaining({ action: "assistant.spend_breaker.tripped", actorId: null }),
    expect.anything(),
  );
  expect(audit).toHaveBeenCalledTimes(1);
  expect(audit).toHaveBeenCalledWith(
    {
      action: "assistant.spend_breaker.tripped",
      actorId: null,
      before: { level: "on" },
      after: {
        level: "hosted_off",
        reason: "hourly_spend",
        threshold: 2000,
        hourlyCents: 2500,
        dailyCents: 2500,
        unsettledAttempts: 0,
      },
      targetId: "assistant.killSwitch",
      targetType: "instance_ops",
    },
    expect.anything(),
  );
  expect(notify).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "assistant_spend_breaker_tripped", severity: "error" }),
  );
});

test("an already paused switch is left alone, whatever the spend", async () => {
  const notify = vi.fn(async () => {});
  const { transaction, upserts } = fake({
    level: "hosted_off",
    spend: () => 10n ** 12n,
    unsettled: 99,
  });
  expect((await runAssistantSpendBreaker({ clock, transaction, notify })).tripped).toBeNull();
  expect(upserts).toEqual([]);
  expect(notify).not.toHaveBeenCalled();
});

test("after a manual reset only spend since the reset counts", async () => {
  const resetAt = new Date("2026-11-14T20:20:00Z");
  const { transaction, sinces, upserts } = fake({
    level: "on",
    resetAt: resetAt.toISOString(),
    // The heavy spend happened before the reset.
    spend: (since) => (since < resetAt ? 50_000_000n : 1_000_000n),
    unsettled: 0,
  });
  const result = await runAssistantSpendBreaker({ clock, transaction, notify: vi.fn() });
  expect(result.tripped).toBeNull();
  expect(sinces.every((since) => since.getTime() === resetAt.getTime())).toBe(true);
  expect(upserts).toEqual([]);
});

test("too many unsettled hosted attempts trip the breaker on their own", async () => {
  const { transaction } = fake({ level: "on", spend: () => 0n, unsettled: 25 });
  const result = await runAssistantSpendBreaker({ clock, transaction, notify: vi.fn() });
  expect(result.tripped?.reason).toBe("unsettled_attempts");
});

test("a level raised to all_off while the breaker measures is never lowered to hosted_off", async () => {
  audit.mockClear();
  const notify = vi.fn(async () => {});
  const { transaction, upserts } = fake({ level: "on", spend: () => 25_000_000n, unsettled: 0 });
  // The first read (the breaker's own early check) sees "on"; the raise re-reads the row and
  // finds "all_off", as if an admin paused everything between the two reads.
  let reads = 0;
  const wrapped = <T>(body: (client: never) => Promise<T>) =>
    transaction((tx: never) => {
      const settings = (tx as { instanceSetting: { findUnique: (args: never) => unknown } })
        .instanceSetting;
      const original = settings.findUnique;
      settings.findUnique = async (args: never) => {
        const key = (args as { where: { key: string } }).where.key;
        if (key !== "assistant.killSwitch") return original(args);
        reads += 1;
        return { value: reads === 1 ? "on" : "all_off" };
      };
      return body(tx);
    });
  const result = await runAssistantSpendBreaker({ clock, transaction: wrapped, notify });
  expect(result.tripped).toBeNull();
  expect(upserts).toEqual([]);
  expect(audit).not.toHaveBeenCalled();
  expect(notify).not.toHaveBeenCalled();
});

test("an admin's all_off is left alone, whatever the spend", async () => {
  const notify = vi.fn(async () => {});
  const { transaction, upserts } = fake({
    level: "all_off",
    spend: () => 10n ** 12n,
    unsettled: 99,
  });
  expect((await runAssistantSpendBreaker({ clock, transaction, notify })).tripped).toBeNull();
  expect(upserts).toEqual([]);
  expect(notify).not.toHaveBeenCalled();
});
