import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import { saveBudget } from "@/lib/metering/store/budgets";
import { createSql } from "@/lib/metering/store/host-sql";
import { createTransactionBoundStore } from "@/lib/metering/store/transactional";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { createModelRequestJournal } from "@/lib/provider-usage/model-request-journal";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admitModelRun, saveModelPaymentQuote } from "./admission";
import { postgresPaymentFixture } from "./admission-concurrency.test-support";
import { createModelPaymentQuote, type ModelPaymentContext } from "./payment";
import { paymentContext } from "./payment.test-support";

const suite = process.env.METERING_TEST_DATABASE_URL ? describe : describe.skip;
suite("independent PostgreSQL pools fence content and consumed confirmation", () => {
  let f: Awaited<ReturnType<typeof postgresPaymentFixture>>;
  beforeAll(async () => {
    f = await postgresPaymentFixture();
  });
  afterAll(async () => {
    await f?.close();
  });
  let budgetVersion = 1;
  async function freshContext(prompt: string): Promise<ModelPaymentContext> {
    const c = paymentContext();
    c.input.prompt = prompt;
    c.budget.version = ++budgetVersion;
    const b = c.columns[0].binding;
    b.credentialVersion =
      ownCredentialVersion(b.column.providerId, b.connectionId, "fixture-envelope") ?? "";
    await f.scoped(f.client()).$transaction(async (tx) => {
      await createTransactionBoundStore({ transaction: tx, clock: { now: () => new Date() } });
      await saveBudget(createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 }), {
        id: c.budget.id,
        version: c.budget.version,
        scope: { kind: "group", namespace: c.namespace, group: c.projectId },
        surface: "any",
        unit: "budget_cents",
        limit: { unit: "budget_cents", value: 1000n, scale: 0 },
        onExceed: "block",
        window: { kind: "calendar_month", timezone: "UTC" },
      });
    });
    return c;
  }
  const consent = (q: ReturnType<typeof createModelPaymentQuote>) => ({
    quoteId: q.quoteId,
    actorId: q.context.actorId,
    projectId: q.context.projectId,
    configHash: q.configHash,
    consent: "non_guaranteed_estimate_v1" as const,
  });

  it.each(["ReadCommitted", "RepeatableRead", "Serializable"] as const)(
    "different quotes cannot both reserve identical content under %s",
    async (isolationLevel) => {
      const c = await freshContext(`Isolation ${isolationLevel}`);
      const quotes = [createModelPaymentQuote(c), createModelPaymentQuote(c)];
      const first = f.scoped(f.client());
      for (const q of quotes) await saveModelPaymentQuote(first, q);
      let arrivals = 0;
      let release = () => {};
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      const contender = (client: PrismaClient) =>
        ({
          $transaction: <T>(body: (tx: Prisma.TransactionClient) => Promise<T>) =>
            client.$transaction(
              async (tx) => {
                await tx.$executeRaw(Prisma.sql`SET LOCAL search_path TO ${Prisma.raw(f.schema)}`);
                return body(
                  new Proxy(tx, {
                    get(target, property) {
                      if (property !== "$queryRaw") return Reflect.get(target, property);
                      return async (...args: unknown[]) => {
                        const rows = await (
                          target.$queryRaw as (...v: unknown[]) => Promise<unknown>
                        )(...args);
                        if (
                          String(args[0]).includes("SELECT snapshot,accepted_at") &&
                          arrivals < 2
                        ) {
                          arrivals++;
                          if (arrivals === 2) release();
                          await barrier;
                        }
                        return rows;
                      };
                    },
                  }),
                );
              },
              { timeout: 30000, isolationLevel },
            ),
        }) as unknown as Pick<PrismaClient, "$transaction">;
      const results = await Promise.all(
        quotes.map((q, i) =>
          admitModelRun(contender(i ? f.second : f.client()), consent(q), {
            readCurrent: async () => c,
          }),
        ),
      );
      expect(arrivals).toBe(2);
      expect(results.map((r) => r.kind)).toEqual(["admitted", "admitted"]);
      expect(results.filter((r) => r.kind === "admitted" && !r.replayed)).toHaveLength(1);
      const attempts = await first.$transaction(
        (tx) => tx.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM model_playground_payment_attempts a JOIN model_playground_payment_quotes q ON q.id=a.quote_id WHERE q.content_hash=${quotes[0].contentHash}`,
      );
      expect(attempts[0].n).toBe(1n);
    },
  );

  it.each([false, true])(
    "concurrent confirmations buy one rerun with fresh quote=%s",
    async (fresh) => {
      const c = await freshContext(`Confirmation ${fresh}`);
      const first = f.scoped(f.client()),
        other = f.scoped(f.second),
        now = new Date(),
        ports = { readCurrent: async () => c, now: () => now };
      const original = createModelPaymentQuote(c);
      await saveModelPaymentQuote(first, original);
      const old = await admitModelRun(first, consent(original), ports);
      if (old.kind !== "admitted") throw new Error("Missing admission");
      await createModelRequestJournal(first, ports).beforeDispatch(old.attempts[0].id);
      now.setTime(now.getTime() + 600001);
      const quotes = [createModelPaymentQuote(c, now), createModelPaymentQuote(c, now)];
      for (const q of quotes) await saveModelPaymentQuote(first, q);
      const confirmation = await admitModelRun(first, consent(quotes[0]), ports);
      if (confirmation.kind !== "confirmation_required") throw new Error("Missing confirmation");
      const results = await Promise.all(
        [first, other].map((db, i) =>
          admitModelRun(
            db,
            { ...consent(quotes[fresh ? i : 0]), confirmUnknown: confirmation },
            ports,
          ),
        ),
      );
      expect(results.map((r) => r.kind)).toEqual(["admitted", "admitted"]);
      expect(results.filter((r) => r.kind === "admitted" && !r.replayed)).toHaveLength(1);
      const attempts = await first.$transaction(
        (tx) => tx.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM model_playground_payment_attempts a JOIN model_playground_payment_quotes q ON q.id=a.quote_id WHERE q.content_hash=${quotes[0].contentHash}`,
      );
      expect(attempts[0].n).toBe(2n);
    },
  );
});
