import { OperationAccessDeniedError } from "./access-error";

/** A temporary, account-scoped admission limit. Existing work is retained. */
export class WeeklyRequestCapError extends OperationAccessDeniedError {
  readonly code = "weekly_request_cap_reached";

  constructor(readonly resetsAt: string) {
    super();
    this.message = "Weekly request capacity reached. Retry after the weekly reset.";
    this.name = "WeeklyRequestCapError";
  }

  retryAfterSeconds(now = Date.now()) {
    return Math.max(1, Math.ceil((Date.parse(this.resetsAt) - now) / 1000));
  }
}
