const CONNECTION_CODES = new Set([
  "08000",
  "08001",
  "08003",
  "08006",
  "53300",
  "57P01",
  "57P02",
  "57P03",
  "P1001",
  "P1002",
  "P1017",
  "P2024",
  "P2037",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
]);
const CONNECTION_MESSAGES = new Set([
  "connection terminated due to connection timeout",
  "connection terminated unexpectedly",
  "connection timeout",
  "server closed the connection unexpectedly",
  "timeout acquiring a connection",
  "timeout exceeded when trying to connect",
]);

function ownValue(value: object, key: string): unknown {
  try {
    return Object.getOwnPropertyDescriptor(value, key)?.value;
  } catch {
    return undefined;
  }
}

/** Recognizes connection failures, not authorization, schema or transaction conflicts. */
export function isTransientDatabaseReadError(error: unknown): boolean {
  const pending: unknown[] = [error];
  const seen = new Set<object>();
  for (let index = 0; index < pending.length && index < 16; index += 1) {
    const candidate = pending[index];
    if (candidate === null || typeof candidate !== "object" || seen.has(candidate)) continue;
    seen.add(candidate);
    if (
      [ownValue(candidate, "code"), ownValue(candidate, "originalCode")].some(
        (code) => typeof code === "string" && CONNECTION_CODES.has(code.toUpperCase()),
      )
    )
      return true;
    const message = ownValue(candidate, "message");
    if (
      typeof message === "string" &&
      message.split("\n").some((line) => CONNECTION_MESSAGES.has(line.trim().toLowerCase()))
    )
      return true;
    for (const key of ["cause", "meta", "driverAdapterError"]) {
      pending.push(ownValue(candidate, key));
    }
  }
  return false;
}

export type DatabaseRead<T> = { ok: true; value: T } | { ok: false };

/** Only for read operations: one short retry, never replay a command or repair data. */
export async function retryTransientDatabaseRead<T>(
  read: () => Promise<T>,
  isTransient: (error: unknown) => boolean = isTransientDatabaseReadError,
): Promise<DatabaseRead<T>> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return { ok: true, value: await read() };
    } catch (error) {
      if (!isTransient(error)) throw error;
      if (attempt === 2) return { ok: false };
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  return { ok: false };
}
