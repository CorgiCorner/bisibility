import { expect, test } from "vitest";
import * as admission from "./admission";
import { input, nativeReceipt, paidFixture, required } from "./paid-attempt-test-fixture";
import { unresolvedSpendingGate } from "./spending-limits";

async function intended(f: Awaited<ReturnType<typeof paidFixture>>) {
  const [reserved] = await f.run((tx) => admission.reservePaidAttempts(tx, [input()], f.options));
  return f.run((tx) =>
    admission.markPaidAttemptDispatch(tx, required(reserved), "worker", f.options),
  );
}
test("durable possible-send fence is single-use and checks the live credential", async () => {
  const f = await paidFixture();
  try {
    const grant = await intended(f);
    await f.run((tx) => admission.fencePaidAttemptsInTransaction(tx, [grant], f.options));
    await expect(
      f.run((tx) => admission.fencePaidAttemptsInTransaction(tx, [grant], f.options)),
    ).rejects.toThrow("fenced");
    await expect(
      f.run((tx) =>
        admission.markPaidAttemptDispatch(
          tx,
          { operation: grant.operation, replayed: false },
          "worker",
          f.options,
        ),
      ),
    ).rejects.toThrow("dispatch");
    const second = await intended(f);
    await expect(
      f.run((tx) =>
        admission.fencePaidAttemptsInTransaction(tx, [second], {
          ...f.options,
          verifyBinding: async () => {
            throw new Error("credential rotated");
          },
        }),
      ),
    ).rejects.toThrow("credential rotated");
  } finally {
    await f.close();
  }
});
test("expired intent cannot fence or become a new send grant after recovery", async () => {
  const f = await paidFixture();
  try {
    const grant = await intended(f);
    f.clock.advance(60001);
    await expect(
      f.run((tx) => admission.fencePaidAttemptsInTransaction(tx, [grant], f.options)),
    ).rejects.toThrow("expired");
    const { claimPaidAttemptRecovery } = await import("./settlement");
    const recovered = await f.run((tx) =>
      claimPaidAttemptRecovery(
        tx,
        { namespace: "test", principal: "owner", operationId: grant.operation.operationId },
        "recovery",
        f.options,
      ),
    );
    expect(recovered.authority.kind).toBe("recovery");
    await expect(
      f.run((tx) =>
        admission.fencePaidAttemptsInTransaction(
          tx,
          [{ ...grant, lease: recovered.lease }],
          f.options,
        ),
      ),
    ).rejects.toThrow();
  } finally {
    await f.close();
  }
});
test("unknown evidence stays pending, and replayed settlement creates one contribution", async () => {
  const f = await paidFixture();
  try {
    const grant = await intended(f);
    await f.run((tx) => admission.fencePaidAttemptsInTransaction(tx, [grant], f.options));
    const { settlePaidAttempt, correctPaidAttempt } = await import("./settlement");
    const settlement = {
      namespace: "test",
      principal: "owner",
      operationId: grant.operation.operationId,
      expectedVersion: grant.operation.version,
      commandId: "native",
      authority: { kind: "lease" as const, leaseId: grant.lease.leaseId },
      receipt: nativeReceipt(true),
    };
    const pending = await f.run((tx) => settlePaidAttempt(tx, settlement, f.options));
    expect(pending.operation.state).toBe("pending");
    expect(
      pending.operation.receipts[0]?.measurements.find((m) => m.unit === "budget_cents")?.certainty,
    ).toBe("unknown");
    expect((await f.run((tx) => settlePaidAttempt(tx, settlement, f.options))).replayed).toBe(true);
    f.clock.advance(60001);
    const corrected = await f.run((tx) =>
      correctPaidAttempt(
        tx,
        {
          ...settlement,
          authority: { kind: "late_evidence", source: "native-proof" },
          commandId: "correct",
          expectedVersion: pending.operation.version,
          receipt: nativeReceipt(),
          replacesReceiptId: settlement.receipt.id,
          reason: "provider proved cost",
        },
        f.options,
      ),
    );
    expect(corrected.operation.state).toBe("settled");
    expect(corrected.operation.receipts).toHaveLength(2);
  } finally {
    await f.close();
  }
});
test.each([false, true])(
  "final live proof reopens an uncertainty gate after correction=%s",
  async (correct) => {
    const f = await paidFixture();
    try {
      const grant = await intended(f);
      await f.run((tx) => admission.fencePaidAttemptsInTransaction(tx, [grant], f.options));
      const { settlePaidAttempt, correctPaidAttempt } = await import("./settlement");
      const settlement = {
        namespace: "test",
        principal: "owner",
        operationId: grant.operation.operationId,
        expectedVersion: grant.operation.version,
        commandId: "native",
        authority: { kind: "lease" as const, leaseId: grant.lease.leaseId },
        receipt: nativeReceipt(correct),
      };
      const gate = unresolvedSpendingGate(
        { kind: "group", namespace: "test", group: "project" },
        "history",
        "2026-09-01T00:00:00Z",
        1,
      );
      await f.store.putBudget(gate);
      const gateLimit = async () => {
        const [row] = await f.run(
          (tx) => tx.$queryRaw<{ body: { limit: unknown } }[]>`
        SELECT body FROM metering_budget WHERE namespace='test' AND budget_id=${gate.id}
        ORDER BY version DESC LIMIT 1`,
        );
        return row?.body.limit;
      };
      const settled = await f.run((tx) => settlePaidAttempt(tx, settlement, f.options));
      if (correct) {
        expect(await gateLimit()).not.toBeNull();
        f.clock.advance(60001);
        await f.run((tx) =>
          correctPaidAttempt(
            tx,
            {
              ...settlement,
              authority: { kind: "late_evidence", source: "native-proof" },
              commandId: "correct",
              expectedVersion: settled.operation.version,
              receipt: nativeReceipt(),
              replacesReceiptId: settlement.receipt.id,
              reason: "provider proved cost",
            },
            f.options,
          ),
        );
      }
      expect(await gateLimit()).toBeNull();
    } finally {
      await f.close();
    }
  },
);

test("missing fence rejects settlement and possible-send cancellation never proves zero", async () => {
  const f = await paidFixture();
  try {
    const grant = await intended(f);
    const { settlePaidAttempt, releasePaidAttempt } = await import("./settlement");
    await expect(
      f.run((tx) =>
        settlePaidAttempt(
          tx,
          {
            namespace: "test",
            principal: "owner",
            operationId: grant.operation.operationId,
            expectedVersion: grant.operation.version,
            commandId: "native",
            authority: { kind: "lease", leaseId: grant.lease.leaseId },
            receipt: nativeReceipt(),
          },
          f.options,
        ),
      ),
    ).rejects.toThrow("fence");
    await expect(
      f.run((tx) =>
        releasePaidAttempt(
          tx,
          {
            namespace: "test",
            principal: "owner",
            operationId: grant.operation.operationId,
            expectedVersion: grant.operation.version,
            commandId: "cancel",
            reason: "timeout",
          },
          f.options,
        ),
      ),
    ).rejects.toThrow();
  } finally {
    await f.close();
  }
});
test("public-only schema admits, fences and settles BYOK without authority epochs", async () => {
  const f = await paidFixture();
  try {
    const grant = await intended(f);
    await f.run((tx) => admission.fencePaidAttemptsInTransaction(tx, [grant], f.options));
    const { settlePaidAttempt } = await import("./settlement");
    const settled = await f.run((tx) =>
      settlePaidAttempt(
        tx,
        {
          namespace: "test",
          principal: "owner",
          operationId: grant.operation.operationId,
          expectedVersion: grant.operation.version,
          commandId: "native",
          authority: { kind: "lease", leaseId: grant.lease.leaseId },
          receipt: nativeReceipt(),
        },
        f.options,
      ),
    );
    expect(settled.operation).toMatchObject({ state: "settled", fundingSource: "byok" });
    expect(settled.operation.receipts[0]?.measurements).toContainEqual({
      unit: "budget_cents",
      certainty: "measured",
      quantity: { value: 20000n, scale: 4, unit: "budget_cents" },
    });
  } finally {
    await f.close();
  }
});
