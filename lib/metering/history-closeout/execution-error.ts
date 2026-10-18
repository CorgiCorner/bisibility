/** No driver message, SQL, URL or stack crosses the operator output boundary. */
export class CloseoutExecutionError extends Error {
  constructor(
    readonly execution: {
      elapsedMs: number;
      statements: number;
      phase: "connect" | "warmup" | "transaction";
      mode: "apply" | "read_only_preview";
      timeoutMs: number;
      maxWaitMs: number;
      code: string;
      category: string;
    },
  ) {
    super("Historical financial closeout refused; no partial batch committed.");
    this.name = "CloseoutExecutionError";
  }
}

export function closeoutFailureCategory(error: unknown) {
  const value =
    error && typeof error === "object"
      ? (error as { code?: unknown; meta?: { error?: unknown } })
      : {};
  const code =
    typeof value.code === "string" && /^[A-Z0-9_]{1,40}$/.test(value.code)
      ? value.code
      : "CLOSEOUT_REFUSED";
  const detail = typeof value.meta?.error === "string" ? value.meta.error : "";
  const category =
    code === "P2028" && detail.includes("Unable to start a transaction")
      ? "transaction_acquisition_timeout"
      : code === "P2028" && detail.includes("expired transaction")
        ? "transaction_expired"
        : code === "P2028"
          ? "transaction_refused"
          : "operator_or_database_refusal";
  return { code, category };
}
