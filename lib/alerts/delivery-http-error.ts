export class DeliveryHttpError extends Error {
  readonly latencyMs: number | null;
  readonly retryAfterSeconds: number | null;
  readonly status: number;

  constructor(
    message: string,
    status: number,
    retryAfterSeconds: number | null,
    latencyMs: number | null = null,
  ) {
    super(message);
    this.name = "DeliveryHttpError";
    this.latencyMs = latencyMs;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
