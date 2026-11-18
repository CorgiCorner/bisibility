import { expect, test, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { ASSISTANT_GUARD_DEFAULTS } from "./guard-config";
import { assertTeamTurnAllowed, teamConcurrencyRefusal, teamDailyRefusal } from "./team-limits";

const config = { ...ASSISTANT_GUARD_DEFAULTS };

test("the daily cap refuses at the cap, not below it", () => {
  // Default 1000 cents = 10_000_000 micro-USD.
  expect(teamDailyRefusal(9_999_999n, config)).toBeNull();
  expect(teamDailyRefusal(10_000_000n, config)).toBe("team_daily_limit");
});

test("a step whose own reservation would cross the cap is refused", () => {
  expect(teamDailyRefusal(9_000_000n, config, 1_000_000n)).toBeNull();
  expect(teamDailyRefusal(9_000_000n, config, 1_000_001n)).toBe("team_daily_limit");
});

test("the concurrency cap refuses one more turn at the cap", () => {
  expect(teamConcurrencyRefusal(1, config)).toBeNull();
  expect(teamConcurrencyRefusal(2, config)).toBe("team_concurrency_limit");
});

function tx(input: {
  active: number;
  spentMicro: string;
  settings?: { key: string; value: string }[];
}) {
  const calls: string[] = [];
  return {
    calls,
    client: {
      $queryRaw: async (strings: TemplateStringsArray) => {
        const sql = strings.join("?");
        calls.push(sql.includes("pg_advisory_xact_lock") ? "lock" : "spend");
        return sql.includes("pg_advisory_xact_lock")
          ? [{ acquired: 1 }]
          : [{ micro: { toFixed: () => input.spentMicro } }];
      },
      instanceSetting: { findMany: async () => input.settings ?? [] },
      assistantRun: {
        count: async (args: unknown) => {
          calls.push(`count:${JSON.stringify(args)}`);
          return input.active;
        },
      },
    },
  };
}

test("a turn start locks the team, then refuses a full team before reading its spend", async () => {
  const { client, calls } = tx({ active: 2, spentMicro: "0" });
  await expect(assertTeamTurnAllowed(client as never, "p1")).rejects.toMatchObject({
    code: "team_concurrency_limit",
    status: 429,
  });
  expect(calls[0]).toBe("lock");
  expect(calls[1]).toContain('"funding":"credits"');
  expect(calls[1]).toContain("awaiting_approval");
  expect(calls[1]).toContain("updatedAt");
  expect(calls).not.toContain("spend");
});

test("a turn start refuses a team over its daily hosted spend and honours a stored cap", async () => {
  const over = tx({ active: 0, spentMicro: "10000000" });
  await expect(assertTeamTurnAllowed(over.client as never, "p1")).rejects.toMatchObject({
    code: "team_daily_limit",
  });
  const raised = tx({
    active: 0,
    spentMicro: "10000000",
    settings: [{ key: "assistant.guard.teamDailyCents", value: "5000" }],
  });
  await expect(assertTeamTurnAllowed(raised.client as never, "p1")).resolves.toBeUndefined();
});
