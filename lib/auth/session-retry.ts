import {
  type DatabaseRead,
  isTransientDatabaseReadError,
  retryTransientDatabaseRead,
} from "@/lib/db/transient-read";

export function isTransientSessionDatabaseError(error: unknown) {
  if (error instanceof Error && error.name === "APIError") {
    const details = error as Error & { statusCode?: unknown; body?: { code?: unknown } };
    if (details.statusCode === 401 || details.statusCode === 403) return false;
  }
  return isTransientDatabaseReadError(error);
}

function isOpaqueSessionBackendError(error: unknown) {
  if (!(error instanceof Error) || error.name !== "APIError") return false;
  const details = error as Error & { statusCode?: unknown; body?: { code?: unknown } };
  return details.statusCode === 500 && details.body?.code === "FAILED_TO_GET_SESSION";
}

export type SessionDatabaseRead<T> = DatabaseRead<T>;

export async function retryTransientSessionDatabaseRead<T>(
  read: () => Promise<T>,
): Promise<SessionDatabaseRead<T>> {
  let attempts = 0;
  return retryTransientDatabaseRead(
    () => {
      attempts += 1;
      return read();
    },
    // Native session reads may refresh expiry. An opaque failure gets one retry,
    // but persistence must throw the actual error rather than hide a backend bug.
    (error) =>
      isTransientSessionDatabaseError(error) ||
      (attempts === 1 && isOpaqueSessionBackendError(error)),
  );
}
