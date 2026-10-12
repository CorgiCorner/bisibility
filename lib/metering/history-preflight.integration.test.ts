import { assertAccountingCutoverNamespace } from "@/scripts/deploy/accounting-cutover-preflight";
import pg from "pg";
import { expect, test } from "vitest";
import { preparePaidAttempt } from "./current-paid-quote";
import { input } from "./paid-attempt-test-fixture";
import { fixture } from "./store/test-fixture";

test.each(["released", "dispatch_intended"])(
  "cutover refuses unresolved %s legacy authority before schema retirement",
  async (state) => {
    const f = await fixture();
    const db = new pg.Client({ connectionString: f.url });
    await db.connect();
    try {
      await db.query(
        `SET search_path TO "${f.schema}"; CREATE TABLE provider_cost_entries(id text); INSERT INTO provider_cost_entries VALUES('legacy')`,
      );
      const reserved = await f.store.reserve(preparePaidAttempt(input("legacy")));
      if (reserved.outcome !== "reserved") throw new Error("Missing reservation fixture");
      if (state === "dispatch_intended")
        await f.store.markDispatchIntent({
          namespace: "test",
          principal: "owner",
          operationId: "legacy",
          expectedVersion: reserved.operation.version,
          commandId: "intent",
          holder: "old-worker",
          leaseTtlMs: 1000,
        });
      f.clock.advance(60001);
      if (state === "released") await f.store.expireReservations({ namespace: "test" });
      await expect(assertAccountingCutoverNamespace(db, "different")).rejects.toThrow("namespace");
      await expect(assertAccountingCutoverNamespace(db, "test")).rejects.toThrow(
        "reconciliation before schema migration",
      );
      expect(
        (await db.query("SELECT count(*)::int AS count FROM provider_cost_entries")).rows[0].count,
      ).toBe(1);
      await db.query("DROP TABLE provider_cost_entries");
      await expect(assertAccountingCutoverNamespace(db, "different")).resolves.toBeUndefined();
    } finally {
      await db.end();
      await f.close();
    }
  },
);
