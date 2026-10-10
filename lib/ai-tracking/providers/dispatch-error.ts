/** The provider transport was never invoked, so zero spend is proved. */
export class TrackingDispatchDeniedError extends Error {
  constructor(
    cause: unknown,
    readonly reason = "dispatch_admission_refused",
  ) {
    super(cause instanceof Error ? cause.message : "Tracking dispatch admission refused.", {
      cause,
    });
  }
}
export class TrackingDeadlineError extends TrackingDispatchDeniedError {
  constructor() {
    super(new Error("Tracking deadline expired."), "deadline_expired");
  }
}
export function assertTrackingDeadline(deadline: string, now = Date.now()) {
  const end = Date.parse(deadline);
  if (!Number.isFinite(end) || end <= now) throw new TrackingDeadlineError();
  return end - now;
}
