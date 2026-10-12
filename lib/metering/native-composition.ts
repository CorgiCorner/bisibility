import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { lockOperationAccounting } from "@/lib/metering/store/accounting-lock";
import { canonical, key } from "@/lib/metering/store/codec";
import {
  load,
  loadReplay,
  lockAccounting,
  newState,
  persist,
  projectUsage,
} from "@/lib/metering/store/command-state";
import { createSql, lock } from "@/lib/metering/store/sql";
import type { CorrectionInput, Receipt, SettleResult } from "@usagekit/core";
import type { State } from "@usagekit/store/reference";
import * as reference from "@usagekit/store/reference";
import { composeOwnReceipt } from "./receipt-composition";
import { readNativeProof } from "./transport-proof-extension";

const snapshot = (state: State): State => ({
  ...state,
  operations: structuredClone(state.operations),
  commands: structuredClone(state.commands),
  reserveAlerts: structuredClone(state.reserveAlerts),
  alerts: new Set(state.alerts),
});

/** Preserve the native stream and invoice stream with only one final accounting projection. */
export async function correctComposedNativeEvidence(
  tx: Prisma.TransactionClient,
  input: CorrectionInput,
  native: Receipt,
  now: Date,
): Promise<SettleResult> {
  const sql = createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 });
  await lockOperationAccounting(sql, input);
  await lock(sql, `metering:operation:${key(input.namespace, input.operationId)}`);
  const state = newState({ now: () => now });
  await load(sql, state, input.namespace, input.operationId);
  await loadReplay(sql, state, input);
  await lockAccounting(sql, state);
  await projectUsage(sql, state, snapshot(state).operations);
  const before = snapshot(state);
  // The unchanged published transition enforces the command, version, holder and correction guards.
  const result = reference.settle(state, input, true);
  if (result.outcome !== "settled" || result.replayed) return result;
  const pk = key(input.namespace, input.operationId),
    original = before.operations.get(pk),
    final = state.operations.get(pk);
  if (!original || !final || original.receipts.at(-1)?.source !== "import")
    throw new Error("Native composition requires an original imported operation");
  const retained = await readNativeProof(tx, original, native.id);
  if (!retained || canonical(retained) !== canonical(native))
    throw new Error("Native composition requires immutable original proof");
  const trusted = await composeOwnReceipt(tx, original, retained);
  if (canonical(trusted) !== canonical(input.receipt))
    throw new Error("Native composition conflicts with its original invoice");
  const existing = original.receipts.find((receipt) => receipt.id === retained.id);
  if (!existing) {
    const composed = final.receipts.at(-1);
    if (!composed) throw new Error("Native composition is missing its final receipt");
    // Raw proof is historical evidence. It never becomes an intermediate effective projection.
    final.receipts = [...original.receipts, retained, composed];
    result.operation = structuredClone(final);
    const command = state.commands.get(
      canonical([input.namespace, input.operationId, input.commandId]),
    );
    if (!command) throw new Error("Native composition is missing its command identity");
    command.result = structuredClone(result);
  }
  await persist(sql, before, state);
  return result;
}
