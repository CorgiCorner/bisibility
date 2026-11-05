import { Context } from "@temporalio/activity";

/** Default interactive transaction: 2s maxWait plus 5s timeout. */
export const QUEUED_SETTLEMENT_SLOT_MS = 7_000;
/** Leave enough time to return a resumable result before the activity closes. */
export const QUEUED_SETTLEMENT_RETURN_MARGIN_MS = 5_000;
export const QUEUED_SETTLEMENT_RESERVE_MS =
  QUEUED_SETTLEMENT_SLOT_MS + QUEUED_SETTLEMENT_RETURN_MARGIN_MS;

export type SettlementBudget = {
  allowsAnother(): boolean;
};

/**
 * True when this activity can still run one settlement and return.
 * Outside an activity there is no start-to-close clock, so settlement is not bounded here.
 */
export function activityAllowsAnotherSettlement(now = Date.now()) {
  try {
    const info = Context.current().info;
    const timeout = info.startToCloseTimeoutMs;
    const started = info.currentAttemptScheduledTimestampMs;
    if (typeof timeout !== "number" || typeof started !== "number" || timeout <= 0) return true;
    return timeout - (now - started) >= QUEUED_SETTLEMENT_RESERVE_MS;
  } catch {
    return true;
  }
}

export function activitySettlementBudget(): SettlementBudget {
  return { allowsAnother: () => activityAllowsAnotherSettlement() };
}
