/** Only transaction/pool/lock failures are retryable; no paid transport is retried. */
export function isModelStorageBusy(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as {
    code?: string;
    originalCode?: string;
    storageBusy?: boolean;
    cause?: unknown;
    meta?: { code?: string; driverAdapterError?: { cause?: unknown } };
  };
  const codes = ["P2024", "P2028", "P2034", "55P03", "57014", "40P01", "40001"];
  return (
    (value.code === "storage" && value.storageBusy === true) ||
    codes.includes(value.code ?? "") ||
    codes.includes(value.originalCode ?? "") ||
    codes.includes(value.meta?.code ?? "") ||
    isModelStorageBusy(value.cause) ||
    isModelStorageBusy(value.meta?.driverAdapterError?.cause)
  );
}
