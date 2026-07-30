import "server-only";

export type MigrationFetchInit = RequestInit & {
  retries?: number;
  timeoutMs?: number;
};

function withTimeout(signal: AbortSignal | null | undefined, timeoutMs: number) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function migrationFetch(
  url: string | URL | Request,
  init: MigrationFetchInit = {},
): Promise<Response> {
  /* Redirects are refused so a malicious target cannot bounce the
     request to another host; migration endpoints never redirect. */
  const { redirect = "error", retries = 0, timeoutMs = 30_000, ...fetchInit } = init;
  let attempt = 0;

  while (true) {
    try {
      return await fetch(url, {
        ...fetchInit,
        redirect,
        signal: withTimeout(fetchInit.signal, timeoutMs),
      });
    } catch (error) {
      if (attempt >= retries) throw error;
      attempt += 1;
    }
  }
}
