import { saveBudget } from "@/lib/metering/store/budgets";
import { createSql } from "@/lib/metering/store/host-sql";
import { createTransactionBoundStore } from "@/lib/metering/store/transactional";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admitModelRun, saveModelPaymentQuote } from "./admission";
import { postgresPaymentFixture } from "./admission-concurrency.test-support";
import { createModelPaymentQuote } from "./payment";

const suite = process.env.METERING_TEST_DATABASE_URL ? describe : describe.skip;
suite("independent PostgreSQL pools serialize native admission", () => {
  let f: Awaited<ReturnType<typeof postgresPaymentFixture>>;
  let context: typeof f.context, quote: typeof f.quote;
  const ports = { readCurrent: async () => context };
  beforeAll(async () => {
    f = await postgresPaymentFixture();
    context = f.context;
    quote = f.quote;
  });
  afterAll(async () => {
    await f?.close();
  });
  it("concurrent accepted replay has one complete durable taskset", async () => {
    const first = f.scoped(f.client()),
      other = f.scoped(f.second);
    await saveModelPaymentQuote(first, quote);
    const input = {
      quoteId: quote.quoteId,
      actorId: context.actorId,
      projectId: context.projectId,
      configHash: quote.configHash,
      consent: "non_guaranteed_estimate_v1" as const,
    };
    const results = await Promise.all([
      admitModelRun(first, input, ports),
      admitModelRun(other, input, ports),
    ]);
    expect(results.map((r) => r.kind)).toEqual(["admitted", "admitted"]);
    const count = await first.$transaction(
      (tx) =>
        tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM model_playground_payment_attempts`,
    );
    expect(count[0].n).toBe(1n);
    await first.$transaction(async (tx) => {
      await createTransactionBoundStore({
        transaction: tx,
        clock: { now: () => new Date() },
      });
      await saveBudget(createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 }), {
        id: context.budget.id,
        version: 2,
        scope: { kind: "group", namespace: context.namespace, group: context.projectId },
        surface: "any",
        unit: "budget_cents",
        limit: { unit: "budget_cents", value: 10n, scale: 0 },
        onExceed: "block",
        window: { kind: "calendar_month", timezone: "UTC" },
      });
    });
    const contenders = ["A", "B"].map((prompt) => ({
      ...structuredClone(context),
      budget: { ...context.budget, version: 2 },
      input: { ...context.input, prompt },
    }));
    const quotes = contenders.map((c) => createModelPaymentQuote(c));
    for (const q of quotes) await saveModelPaymentQuote(first, q);
    const raced = await Promise.all(
      quotes.map((q, i) =>
        admitModelRun(
          i === 0 ? first : other,
          { ...input, quoteId: q.quoteId, configHash: q.configHash },
          { readCurrent: async () => contenders[i] },
        ),
      ),
    );
    expect(raced.map((r) => r.kind).sort()).toEqual(["admitted", "not_dispatched"]);
    expect(raced.find((r) => r.kind === "not_dispatched")).toMatchObject({
      reason: "budget_exhausted",
    });
  });
});
