import { z } from "zod";

/** Longest reason an admin may give for a kill switch flip; it is stored in the audit record. */
export const KILL_SWITCH_REASON_MAX = 500;

/**
 * The reason every kill switch flip requires, shared by the admin form and the server action:
 * trimmed, then 1 to KILL_SWITCH_REASON_MAX characters.
 */
export function killSwitchReasonSchema(message = "reason") {
  return z.string().trim().min(1, message).max(KILL_SWITCH_REASON_MAX, message);
}
