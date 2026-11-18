import type { Prisma } from "@/lib/generated/prisma/client";
import * as transactionMeter from "@/lib/metering/transaction-meter";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import {
  createModelRequestJournal,
  recordModelDispatchEvidence,
} from "@/lib/provider-usage/model-request-journal";
import { generateModelResponse } from "@/lib/providers/model/transport";
import { generation, json } from "@/lib/providers/model/transport.test-support";
import { expect, it, vi } from "vitest";
import { paymentHarness } from "./admission.postgres.test-support";
import { measuredResult, reportedResult } from "./usage.test-support";
import * as usageStorage from "./usage-storage";

vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: async () => ({ success: true }),
}));
const f = paymentHarness();
async function admitted(count = 1) {
  const result = await f.admit(await f.quote(count));
  if (result.kind !== "admitted") throw new Error("Missing admission");
  const observer = createModelRequestJournal(f.database, f.ports);
  for (const a of result.attempts) await observer.beforeDispatch(a.id);
  return result.attempts;
}

it("retains both columns when one native request links to a pending canonical operation", async () => {
  const attempts = await admitted(2);
  for (const a of attempts) {
    const response = {
      ...measuredResult(),
      column: a.binding.column,
      providerRequestId: "pending-native-request",
    };
    response.usage.cacheReadInputTokens = null;
    expect(await recordModelDispatchEvidence(f.database, a.id, response, f.now)).toMatchObject({
      state: "unknown",
    });
  }
  const rows = (
    await f.sql.query<{ observed_at: Date | null }>(
      `SELECT observed_at FROM model_playground_payment_attempts`,
    )
  ).rows;
  expect(rows.every((r) => r.observed_at !== null)).toBe(true);
  expect(
    (
      await f.sql.query(
        `SELECT * FROM metering_usage_evidence WHERE "providerRequestId"='pending-native-request'`,
      )
    ).rows,
  ).toHaveLength(2);
  expect(
    (
      await f.sql.query(
        `SELECT * FROM model_playground_payment_observations WHERE accounting_reason='receipt_conflict'`,
      )
    ).rows,
  ).toHaveLength(1);
});

it("retains a conflicting late receipt without failing the answer or overwriting earlier proof", async () => {
  const [a] = await admitted();
  await recordModelDispatchEvidence(
    f.database,
    a.id,
    { ...reportedResult("0.1"), column: a.binding.column },
    f.now,
  );
  await expect(
    createModelRequestJournal(f.database, f.ports).settle(a.id, {
      ...reportedResult("0.2"),
      column: a.binding.column,
    }),
  ).resolves.toBeUndefined();
  const rows = (
    await f.sql.query<{
      response: { providerCost: { amount: string } };
      accounting_reason: string;
    }>(`SELECT response,accounting_reason FROM model_playground_payment_observations`)
  ).rows;
  expect(rows.map((r) => r.response.providerCost.amount).sort()).toEqual(["0.1", "0.2"]);
  expect(rows.some((r) => r.accounting_reason === "evidence_conflict")).toBe(true);
  expect(
    (
      await f.sql.query<{ receipt: { monetary: { total: { amount: string } } } }>(
        `SELECT receipt FROM metering_usage_evidence WHERE id=$1`,
        [a.id],
      )
    ).rows[0].receipt.monetary.total.amount,
  ).toBe("0.1");
});

it("replays evidence after its commit when the separate accounting transaction failed", async () => {
  const [a] = await admitted();
  let transactions = 0;
  const database = {
    $transaction: async <T>(body: (tx: Prisma.TransactionClient) => Promise<T>) => {
      transactions++;
      if (transactions === 2) throw new Error("Simulated accounting process loss");
      return f.database.$transaction(body);
    },
  } as typeof f.database;
  const response = { ...measuredResult(), column: a.binding.column };
  expect(await recordModelDispatchEvidence(database, a.id, response, f.now)).toMatchObject({
    state: "unknown",
  });
  expect(
    (
      await f.sql.query(
        `SELECT * FROM model_playground_payment_attempts WHERE observed_at IS NOT NULL`,
      )
    ).rows,
  ).toHaveLength(1);
  expect((await f.sql.query(`SELECT * FROM metering_receipt`)).rows).toHaveLength(0);
  expect(await recordModelDispatchEvidence(f.database, a.id, response, f.now)).toMatchObject({
    state: "settled",
  });
  expect((await f.sql.query(`SELECT * FROM metering_receipt`)).rows).toHaveLength(1);
});

it("never throws into transport for an accounting database failure", async () => {
  const [a] = await admitted();
  const database = {
    $transaction: vi.fn().mockRejectedValue(new Error("Accounting offline")),
  } as typeof f.database;
  vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(
    createModelRequestJournal(database, f.ports).settle(a.id, {
      ...measuredResult(),
      column: a.binding.column,
    }),
  ).resolves.toBeUndefined();
});

it.each(["version_conflict", "receipt_conflict"] as const)(
  "records a library %s after evidence commit and preserves replay",
  async (reason) => {
    const [a] = await admitted();
    const response = { ...measuredResult(), column: a.binding.column };
    const original = transactionMeter.createTransactionMeter;
    const spy = vi
      .spyOn(transactionMeter, "createTransactionMeter")
      .mockImplementation(async (...args) => {
        const meter = await original(...args);
        return {
          ...meter,
          settle: async () => ({ outcome: "rejected" as const, reason, operation: null }),
        };
      });
    try {
      expect(await recordModelDispatchEvidence(f.database, a.id, response, f.now)).toMatchObject({
        state: "unknown",
        accountingReason: reason,
      });
      expect(
        (
          await f.sql.query(
            `SELECT * FROM metering_usage_evidence WHERE id=$1 AND receipt->'evidence' IS NOT NULL`,
            [a.id],
          )
        ).rows,
      ).toHaveLength(1);
      expect(
        (
          await f.sql.query(
            `SELECT * FROM model_playground_payment_observations WHERE accounting_reason=$1`,
            [reason],
          )
        ).rows,
      ).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
    expect(await recordModelDispatchEvidence(f.database, a.id, response, f.now)).toMatchObject({
      state: "settled",
    });
  },
);

it("guards committed observation bytes while allowing accounting recovery status updates", async () => {
  const [a] = await admitted();
  await recordModelDispatchEvidence(
    f.database,
    a.id,
    { ...measuredResult(), column: a.binding.column },
    f.now,
  );
  await expect(
    f.sql.exec(`UPDATE model_playground_payment_observations SET response='{}'`),
  ).rejects.toThrow("Immutable model observation");
  await f.sql.exec(
    `UPDATE model_playground_payment_observations SET accounting_status='pending',accounting_reason='recovery'`,
  );
});

it("retains the gateway two-column request when supplementary routing evidence conflicts", async () => {
  const q = await f.quote(2, (c) => {
    for (const { binding: b } of c.columns) {
      b.column.providerId = "vercel_ai_gateway";
      b.credentialVersion =
        ownCredentialVersion(b.column.providerId, b.connectionId, "encrypted-fixture") ?? "";
    }
  });
  await f.sql.exec(`UPDATE provider_connections SET provider='vercel_ai_gateway'`);
  const result = await f.admit(q);
  if (result.kind !== "admitted") throw new Error("Missing admission");
  const observer = createModelRequestJournal(f.database, f.ports);
  for (const a of result.attempts) await observer.beforeDispatch(a.id);
  const [a, b] = result.attempts;
  expect(
    await recordModelDispatchEvidence(
      f.database,
      a.id,
      {
        ...measuredResult(),
        column: a.binding.column,
        providerRequestId: "shared-gateway-request",
      },
      f.now,
    ),
  ).toMatchObject({ state: "unknown" });
  await expect(
    observer.settle(b.id, {
      ...measuredResult(),
      column: b.binding.column,
      providerRequestId: "shared-gateway-request",
      routingAttemptCredentials: {
        version: 1,
        completeness: "complete",
        attempts: [{ outcome: "succeeded", credentialSource: "gateway_system" }],
      },
    }),
  ).resolves.toBeUndefined();
  expect(
    (await f.sql.query(`SELECT * FROM model_playground_payment_observations`)).rows,
  ).toHaveLength(2);
  expect(
    (
      await f.sql.query(
        `SELECT * FROM model_playground_payment_observations WHERE accounting_reason='evidence_conflict'`,
      )
    ).rows,
  ).toHaveLength(1);
});

it("returns the paid transport answer when its accounting transaction cannot run", async () => {
  const result = await f.admit(await f.quote());
  if (result.kind !== "admitted") throw new Error("Missing admission");
  const a = result.attempts[0];
  let calls = 0;
  const database = {
    $transaction: <T>(body: (tx: Prisma.TransactionClient) => Promise<T>) => {
      if (++calls > 1) return Promise.reject(new Error("Accounting unavailable"));
      return f.database.$transaction(body);
    },
  } as typeof f.database;
  const config = generation();
  config.column = a.binding.column;
  config.providerId = a.binding.column.providerId;
  config.operationKey = a.id;
  config.observer = createModelRequestJournal(database, f.ports);
  config.normalize = () => ({
    ...measuredResult(),
    column: a.binding.column,
    answer: "Retained paid answer",
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json()));
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await generateModelResponse(config)).toMatchObject({ answer: "Retained paid answer" });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("a transient evidence write error is replayable accounting_error, never evidence_conflict", async () => {
  const [a] = await admitted();
  const response = { ...measuredResult(), column: a.binding.column };
  const spy = vi
    .spyOn(usageStorage, "persistModelUsageEvidence")
    .mockRejectedValueOnce(new Error("transient evidence write"));
  try {
    expect(await recordModelDispatchEvidence(f.database, a.id, response, f.now)).toMatchObject({
      accountingReason: "accounting_error",
    });
    expect(
      (await f.sql.query(`SELECT accounting_reason FROM model_playground_payment_observations`))
        .rows,
    ).toEqual([{ accounting_reason: "accounting_error" }]);
  } finally {
    spy.mockRestore();
  }
  expect(await recordModelDispatchEvidence(f.database, a.id, response, f.now)).toMatchObject({
    state: "settled",
  });
  expect((await f.sql.query(`SELECT * FROM metering_receipt`)).rows).toHaveLength(1);
});
