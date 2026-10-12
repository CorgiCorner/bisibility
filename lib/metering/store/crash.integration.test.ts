import { once } from "node:events";
import { createServer } from "node:http";
import { markPaidAttemptDispatch, reservePaidAttempts } from "@/lib/metering/admission";
import {
  input,
  nativeReceipt,
  paidFixture,
  required,
} from "@/lib/metering/paid-attempt-test-fixture";
import { claimPaidAttemptRecovery, settlePaidAttempt } from "@/lib/metering/settlement";
import { expect, test } from "vitest";
import { killAtBarrier } from "./crash-test-child";
import { Prisma } from "./sql";
import { command, receipt, ref, request } from "./test-data";
import { fixture } from "./test-fixture";

test.each(["before_reservation_commit", "after_reservation_commit", "after_settlement_commit"])(
  "SIGKILL at %s preserves exactly the committed accounting",
  async (phase) => {
    const f = await fixture();
    try {
      const message = await killAtBarrier(f.url, f.schema, phase);
      const store = await f.restart();
      const op = await store.getOperation(ref(request("crash-operation")));
      if (phase === "before_reservation_commit") {
        expect(op).toBeNull();
        const [row] = await f
          .client()
          .$queryRaw<{ count: bigint }[]>(
            Prisma.sql`SELECT count(*) FROM ${Prisma.raw(f.schema)}.metering_event`,
          );
        expect(row?.count).toBe(0n);
      } else if (phase === "after_reservation_commit") {
        expect(op).toMatchObject({ state: "reserved", lease: null, receipts: [] });
        expect(await store.reserve(request("crash-operation"))).toMatchObject({
          outcome: "reserved",
          replayed: true,
        });
      } else {
        expect(op).toMatchObject({ state: "settled" });
        expect(op?.receipts).toHaveLength(1);
        if (!op) throw new Error("Missing operation");
        expect(
          await store.markDispatchIntent({
            ...command(op),
            holder: "reopen",
            leaseTtlMs: 60000,
          }),
        ).toMatchObject({ granted: false });
        expect(
          await store.settle({
            ...command(op),
            expectedVersion: message.expectedVersion,
            commandId: "settlement",
            receipt: { ...receipt(), id: "native" },
            authority: { kind: "lease", leaseId: message.leaseId },
          }),
        ).toMatchObject({ outcome: "settled", replayed: true });
      }
    } finally {
      await f.close();
    }
  },
);

test("SIGKILL in all-task preparation leaves no partial reservation or dispatch capability", async () => {
  const f = await fixture();
  try {
    await killAtBarrier(f.url, f.schema, "queued_preparation");
    await f.restart();
    const [row] = await f.client().$queryRaw<{ operations: bigint; contexts: bigint }[]>(Prisma.sql`
      SELECT (SELECT count(*) FROM ${Prisma.raw(f.schema)}.metering_operation) AS operations,
      (SELECT count(*) FROM ${Prisma.raw(f.schema)}.metering_paid_attempt_context) AS contexts`);
    expect(row).toEqual({ operations: 0n, contexts: 0n });
  } finally {
    await f.close();
  }
});

test("recovery after one paid POST records proof without sending another POST", async () => {
  let posts = 0;
  const server = createServer((request, response) => {
    if (request.method === "POST") posts++;
    response.end("native-proof");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing fixture address");
  const f = await paidFixture();
  try {
    await killAtBarrier(f.url, f.schema, "after_http", `http://127.0.0.1:${address.port}`);
    expect(posts).toBe(1);
    await f.restart();
    const operationRef = { namespace: "test", principal: "owner", operationId: "paid-http" };
    expect(await f.store.getOperation(operationRef)).toMatchObject({
      state: "dispatch_intended",
      receipts: [],
    });
    const [replay] = await f.run((tx) => reservePaidAttempts(tx, [input("paid-http")], f.options));
    await expect(
      f.run((tx) => markPaidAttemptDispatch(tx, required(replay), "retry", f.options)),
    ).rejects.toThrow("replay");
    f.clock.advance(61000);
    const recovered = await f.run((tx) =>
      claimPaidAttemptRecovery(tx, operationRef, "recovery", f.options),
    );
    const proof = {
      ...operationRef,
      commandId: "native-proof",
      expectedVersion: recovered.operation.version,
      authority: recovered.authority,
      receipt: nativeReceipt(),
    };
    await f.run((tx) => settlePaidAttempt(tx, proof, f.options));
    await f.run((tx) => settlePaidAttempt(tx, proof, f.options));
    expect((await f.store.getOperation(operationRef))?.receipts).toHaveLength(1);
    expect(posts).toBe(1);
  } finally {
    await f.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
