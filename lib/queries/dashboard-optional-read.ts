import { AuthorizationError } from "@/lib/auth/authorize";

export type OptionalDashboardRead<T> =
  | { state: "ready"; value: T }
  | { state: "error"; value: null };

/** Reauthorization keeps denied or expired access outside optional widget failure handling. */
export async function optionalDashboardRead<T>(
  read: () => Promise<T>,
  reauthorize: () => Promise<unknown>,
): Promise<OptionalDashboardRead<T>> {
  try {
    return { state: "ready", value: await read() };
  } catch (failure) {
    if (
      failure instanceof AuthorizationError ||
      (failure &&
        typeof failure === "object" &&
        "digest" in failure &&
        typeof failure.digest === "string" &&
        /^NEXT_(REDIRECT|HTTP_ERROR_FALLBACK);/.test(failure.digest))
    )
      throw failure;
    await reauthorize();
    return { state: "error", value: null };
  }
}
