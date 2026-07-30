const TRANSIENT_DATABASE_CODES = new Set([
  "08000",
  "08003",
  "08006",
  "57P01",
  "57P02",
  "57P03",
  "ECONNRESET",
  "ETIMEDOUT",
]);
const TRANSIENT_DATABASE_MESSAGES = [
  /connection terminated due to connection timeout/i,
  /connection terminated unexpectedly/i,
  /connection timeout/i,
  /server closed the connection unexpectedly/i,
  /timeout acquiring a connection/i,
];
const MAX_SESSION_READ_ATTEMPTS = 2;
const RETRY_DELAY_MS = 25;

type ErrorDetails = { cause?: unknown; code?: unknown; message?: unknown };

function errorChain(error: unknown) {
  const chain: ErrorDetails[] = [];
  let current = error;
  while (current && typeof current === "object" && chain.length < 8) {
    const details = current as ErrorDetails;
    chain.push(details);
    current = details.cause;
  }
  return chain;
}

export function isTransientSessionDatabaseError(error: unknown) {
  return errorChain(error).some((item) => {
    const code = typeof item.code === "string" ? item.code.toUpperCase() : "";
    const message = typeof item.message === "string" ? item.message : "";
    return (
      TRANSIENT_DATABASE_CODES.has(code) ||
      TRANSIENT_DATABASE_MESSAGES.some((pattern) => pattern.test(message))
    );
  });
}

export type SessionDatabaseRead<T> = { ok: true; value: T } | { ok: false };

export async function retryTransientSessionDatabaseRead<T>(
  read: () => Promise<T>,
): Promise<SessionDatabaseRead<T>> {
  for (let attempt = 1; attempt <= MAX_SESSION_READ_ATTEMPTS; attempt += 1) {
    try {
      return { ok: true, value: await read() };
    } catch (error) {
      if (!isTransientSessionDatabaseError(error)) throw error;
      if (attempt === MAX_SESSION_READ_ATTEMPTS) return { ok: false };
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
  return { ok: false };
}
