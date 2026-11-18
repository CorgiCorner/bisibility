import { saveBudget } from "@/lib/metering/store/budgets";
import { decode } from "@/lib/metering/store/codec";
import { createSql } from "@/lib/metering/store/host-sql";
import { afterEach, expect, test, vi } from "vitest";
import { readModelAttempts } from "./admission-storage";
import { executeModelPlayground } from "./execute";
import { launchModelPlayground } from "./launch";
import { launchHarness, launchRequest } from "./launch.test-support";
import { previewModelPlayground, unavailableModelValuation } from "./preview";
import { readModelPlayground } from "./read";
import { measuredResult } from "./usage.test-support";

const h = launchHarness();
afterEach(() => vi.restoreAllMocks());
const preview = () => previewModelPlayground(h.runtime, { revision: "revision", input: h.input });

test.each(["unpriced", "mixed", "over"])(
  "a 20 USD budget counts only priced columns across ten %s columns",
  async (kind) => {
    await h.runtime.db.$transaction((tx) =>
      saveBudget(createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 }), {
        id: `project:${h.context.projectId}:monthly`,
        version: 2,
        scope: { kind: "group", namespace: h.context.namespace, group: h.context.projectId },
        surface: "any",
        unit: "budget_cents",
        limit: { unit: "budget_cents", value: 2000n, scale: 0 },
        onExceed: "block",
        window: { kind: "calendar_month", timezone: "UTC" },
      }),
    );
    h.answer((answer) => ({ ...answer, usage: measuredResult().usage }));
    const priced = new Set<string>();
    const runs = [];
    h.runtime.valuation = (column) =>
      priced.has(column.columnId)
        ? {
            policy: h.context.columns[0].binding.policy,
            rateCard: h.context.columns[0].binding.rateCard,
            forecast: { ...h.context.columns[0].forecast, amount: kind === "over" ? "4.01" : "4" },
            advisory: { cents: kind === "over" ? "401" : "400", basis: "rate_card" },
          }
        : unavailableModelValuation(column);
    // The product caps one run at six columns: ten columns use two independent five-column runs.
    for (let batch = 0; batch < 2; batch++) {
      h.input.prompt = `Question ${batch}`;
      h.input.columns = Array.from({ length: 5 }, (_, index) => {
        const column = structuredClone(h.context.input.columns[0]);
        column.columnId = crypto.randomUUID();
        column.payment.optionId = `byok:${column.connectionId}`;
        column.settings.maxOutputTokens = 4096;
        if (kind !== "unpriced" && (batch * 5 + index) % 2 === 0) priced.add(column.columnId);
        return column;
      });
      const q = await preview();
      expect(q.forecasts.filter((c) => c.money.certainty === "unknown")).toHaveLength(
        kind === "unpriced" ? 5 : batch === 0 ? 2 : 3,
      );
      if (kind === "over" && batch === 1) {
        expect((await launchModelPlayground(h.runtime, launchRequest(q))).kind).toBe(
          "not_dispatched",
        );
        expect(h.calls).toHaveLength(0);
      } else {
        const run = await h.admitOnly(q);
        const attempts = await h.runtime.db.$transaction((tx) =>
          readModelAttempts(tx, q.previewId),
        );
        runs.push({ runId: run.id, projectId: h.context.projectId, attempts });
      }
    }
    const rows = await h.sql.query<{ input: unknown }>("SELECT input FROM metering_operation");
    const reserved = rows.rows
      .flatMap((r) => decode<{ estimate: { unit: string; value: bigint }[] }>(r.input).estimate)
      .filter((q) => q.unit === "budget_cents");
    expect(reserved.reduce((sum, q) => sum + BigInt(q.value), 0n)).toBe(
      kind === "unpriced" ? 0n : kind === "mixed" ? 2000n : 1203n,
    );
    if (kind !== "over") {
      for (const run of runs) {
        expect(
          (await executeModelPlayground(h.runtime, run)).every((r) => r.state === "finished"),
        ).toBe(true);
        expect((await readModelPlayground(h.runtime, run.runId))?.columns).toHaveLength(5);
      }
      expect(h.calls).toHaveLength(10);
      expect(
        (await h.sql.query("SELECT * FROM metering_operation WHERE state='settled'")).rows,
      ).toHaveLength(10);
    }
  },
);

test.each([
  ["costEvidence", false],
  ["costEvidence", true],
  ["routingAttemptCredentials", false],
  ["routingAttemptCredentials", true],
] as const)(
  "oversized %s survives settlement and reload with store failure=%s",
  async (field, storeFailure) => {
    const q = await preview();
    if (storeFailure)
      await h.sql.exec(`CREATE FUNCTION reject_result() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture result failure'; END $$;
      CREATE TRIGGER fail_result BEFORE UPDATE ON model_playground_columns FOR EACH ROW WHEN (NEW.result IS NOT NULL) EXECUTE FUNCTION reject_result();`);
    h.answer((answer) => ({ ...answer, [field]: { oversized: "x".repeat(300_000) } }));
    const out = await launchModelPlayground(h.runtime, launchRequest(q));
    if (out.kind !== "admitted") throw new Error("Expected admitted");
    expect(out.result.columns[0].answer).toBe("An answer with two citations.");
    const durable = await h.sql.query<{ result: import("./types").ModelColumnResult | null }>(
      "SELECT result FROM model_playground_columns",
    );
    if (storeFailure) expect(durable.rows[0].result).toBeNull();
    else
      expect(durable.rows[0].result).toMatchObject({
        state: "completed",
        answer: "An answer with two citations.",
        truncation: { metadata: true },
      });
    expect((await readModelPlayground(h.runtime, out.result.runId))?.columns[0]).toMatchObject({
      state: "completed",
      answer: "An answer with two citations.",
      truncation: { metadata: true, application: false },
    });
    const read = await readModelPlayground(h.runtime, out.result.runId);
    expect(read?.progress?.[0].state).toBe("observed");
    expect(read?.columns[0]).toMatchObject({
      state: "completed",
      answer: "An answer with two citations.",
      truncation: { metadata: true },
    });
    expect(h.calls).toHaveLength(1);
  },
);

test("an observed attempt with malformed evidence still reads as a visible unknown column", async () => {
  const q = await preview();
  h.answer(() => ({}) as import("./types").ModelColumnResult);
  const out = await launchModelPlayground(h.runtime, launchRequest(q));
  if (out.kind !== "admitted") throw new Error("Expected admitted");
  const read = await readModelPlayground(h.runtime, out.result.runId);
  expect(read?.progress?.[0].state).toBe("observed");
  expect(read?.columns[0]).toMatchObject({
    state: "unknown",
    failure: "accounting_unknown",
    answer: null,
  });
  expect(h.calls).toHaveLength(1);
});

test("metadata retention flag has the same absent-or-true contract in SQL and the parser", async () => {
  const { migrationSql } = await import("./admission.postgres.test-support");
  const { result } = await import("./contract-fixtures.test-support");
  const { modelColumnResultSchema } = await import("./types");
  await h.sql.exec("CREATE TABLE retention_shape(result jsonb)");
  await h.sql.exec(
    (await migrationSql("20261113193100_model_playground_retention_metadata")).replace(
      "ALTER TABLE model_playground_columns",
      "ALTER TABLE retention_shape",
    ),
  );
  for (const flag of [undefined, true, false, null, "true", 1]) {
    const value = result();
    if (flag !== undefined) Object.assign(value.truncation, { metadata: flag });
    const accepted = flag === undefined || flag === true;
    expect(modelColumnResultSchema.safeParse(value).success).toBe(accepted);
    const insert = h.sql.query("INSERT INTO retention_shape VALUES($1::jsonb)", [
      JSON.stringify(value),
    ]);
    if (accepted) await expect(insert).resolves.toBeDefined();
    else await expect(insert).rejects.toMatchObject({ code: "23514" });
  }
});
