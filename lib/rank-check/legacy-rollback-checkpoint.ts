import { setTimeout as delay } from "node:timers/promises";

export type LegacyRollbackPhase = "create" | "done" | "reconcile";
export type LegacyRollbackMutationStatus = "created" | "exact" | "updated";

type LegacyRollbackTotals = {
  created: number;
  exact: number;
  failed: number;
  page: number;
  selected: number;
  updated: number;
};

type LegacyRollbackCheckpointV1 = {
  baselineUnrelatedHash: string;
  cursor: string | null;
  totals: LegacyRollbackTotals;
  version: 1;
};

type LegacyRollbackCheckpointV2 = {
  baselineSchedulerCount: number;
  baselineUnrelatedHash: string;
  cursor: string | null;
  phase: LegacyRollbackPhase;
  totals: LegacyRollbackTotals;
  version: 2;
};

export type LegacyRollbackCheckpoint = {
  baselineSchedulerCount: number;
  baselineUnrelatedHash: string;
  cursor: string | null;
  pageProgress: Array<{ scheduleId: string; status: LegacyRollbackMutationStatus }>;
  pending: { existedBefore: boolean; scheduleId: string } | null;
  phase: LegacyRollbackPhase;
  totals: LegacyRollbackTotals;
  version: 3;
};

export type LegacyRollbackCheckpointInput =
  | LegacyRollbackCheckpoint
  | LegacyRollbackCheckpointV1
  | LegacyRollbackCheckpointV2;

export type LegacyRollbackInventory = {
  ambiguousIds?: string[];
  ownedIds: string[];
  pausedOwnedIds: string[];
  unrelatedHash: string;
  unrelatedIds: string[];
};

const EMPTY_TOTALS: LegacyRollbackTotals = {
  created: 0,
  exact: 0,
  failed: 0,
  page: 0,
  selected: 0,
  updated: 0,
};

export function createLegacyRollbackCheckpoint(
  unrelatedHash: string,
  schedulerCount: number,
  initial?: LegacyRollbackCheckpointInput,
): LegacyRollbackCheckpoint {
  if (!initial) {
    return {
      baselineSchedulerCount: schedulerCount,
      baselineUnrelatedHash: unrelatedHash,
      cursor: null,
      pageProgress: [],
      pending: null,
      phase: "create",
      totals: { ...EMPTY_TOTALS },
      version: 3,
    };
  }
  if (initial.version === 1) {
    const baselineSchedulerCount = schedulerCount - initial.totals.created;
    if (!Number.isSafeInteger(baselineSchedulerCount) || baselineSchedulerCount < 0) {
      throw new Error("Invalid v1 rollback checkpoint scheduler baseline.");
    }
    return {
      ...structuredClone(initial),
      baselineSchedulerCount,
      pageProgress: [],
      pending: null,
      phase: "create",
      version: 3,
    };
  }
  if (initial.version === 2) {
    return {
      ...structuredClone(initial),
      pageProgress: [],
      pending: null,
      version: 3,
    };
  }
  if (initial.version !== 3) throw new Error("Unsupported rollback checkpoint version.");
  return structuredClone(initial);
}

export function recordLegacyRollbackStatus(
  state: LegacyRollbackCheckpoint,
  scheduleId: string,
  status: LegacyRollbackMutationStatus,
) {
  state.pageProgress.push({ scheduleId, status });
  if (status === "created") state.totals.created += 1;
  else if (status === "exact") state.totals.exact += 1;
  else state.totals.updated += 1;
}

export async function recoverLegacyRollbackPending(
  state: LegacyRollbackCheckpoint,
  inventory: LegacyRollbackInventory,
  options: {
    intervalMs?: number;
    maxAttempts?: number;
    read: () => Promise<LegacyRollbackInventory>;
  },
  onCheckpoint?: (checkpoint: LegacyRollbackCheckpoint) => Promise<void>,
) {
  if (!state.pending) return inventory;
  const intervalMs = options.intervalMs ?? 1_000;
  const maxAttempts = options.maxAttempts ?? 31;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error("maxAttempts must be a positive integer.");
  }
  if (!Number.isInteger(intervalMs) || intervalMs < 0) {
    throw new Error("intervalMs must be a non-negative integer.");
  }
  const pending = state.pending;
  let current = inventory;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (current.pausedOwnedIds.includes(pending.scheduleId)) {
      recordLegacyRollbackStatus(
        state,
        pending.scheduleId,
        pending.existedBefore ? "exact" : "created",
      );
      state.pending = null;
      await onCheckpoint?.(structuredClone(state));
      return current;
    }
    if (attempt + 1 < maxAttempts) {
      if (intervalMs > 0) await delay(intervalMs);
      current = await options.read();
    }
  }
  return current;
}
