import { IdentityMapsUrlError } from "@/lib/business-locations/identity-errors";
import type { BusinessCommandResult } from "@/lib/business-locations/ui-contracts";
import { BusinessLocationConflictError } from "./errors";

export async function businessCommandResult<T>(
  run: () => Promise<T>,
  readCurrent?: () => Promise<T>,
): Promise<BusinessCommandResult<T>> {
  try {
    return { kind: "saved", value: await run() };
  } catch (error) {
    if (error instanceof IdentityMapsUrlError)
      return { kind: "identity_error", reason: error.reason };
    if (!(error instanceof BusinessLocationConflictError)) return { kind: "error" };
    if (error.reason === "identifier_claimed") return { kind: "identifier_claimed" };
    let current: T | null = null;
    if (readCurrent && error.reason === "revision_conflict") {
      try {
        current = await readCurrent();
      } catch {
        /* Access may have changed after the write attempt. */
      }
    }
    return { kind: "conflict", current, reason: error.reason };
  }
}
