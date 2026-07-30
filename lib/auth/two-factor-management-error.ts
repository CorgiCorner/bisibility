export type TwoFactorManagementErrorCode =
  | "enrollment_expired"
  | "invalid_input"
  | "rate_limited"
  | "session_not_fresh"
  | "step_up_failed"
  | "step_up_locked"
  | "unavailable";

export class TwoFactorManagementError extends Error {
  constructor(
    readonly code: TwoFactorManagementErrorCode,
    message: string,
    readonly retryAt?: number,
  ) {
    super(message);
    this.name = "TwoFactorManagementError";
  }
}
