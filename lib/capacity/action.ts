import {
  isOperationAccessDeniedError,
  OperationAccessDeniedError,
} from "@/lib/operations/access-error";
import { type CapacityLimitDetails, CapacityLimitError } from "./errors";
import { publishCapacityNotice } from "./notice-store";

export type CapacityFailure = {
  ok: false;
  capacityFailure: {
    code: "plan_limit_reached" | "subscription_required";
    message: string;
    details?: CapacityLimitDetails;
  };
};

function isCapacityFailure(value: unknown): value is CapacityFailure {
  if (!value || typeof value !== "object" || !("capacityFailure" in value)) return false;
  const failure = value.capacityFailure;
  return (
    !!failure &&
    typeof failure === "object" &&
    "code" in failure &&
    (failure.code === "plan_limit_reached" || failure.code === "subscription_required")
  );
}

/** Tests and callers that require the success value reject a structured denial. */
export function unwrapCapacityResult<T>(result: T | CapacityFailure): T {
  if (isCapacityFailure(result)) throw new Error(result.capacityFailure.message);
  return result;
}

/** Expected denials must survive production Server Action error redaction. */
export async function withCapacityFailure<T>(run: () => Promise<T>): Promise<T | CapacityFailure> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof CapacityLimitError && error.name === "CapacityLimitError")
      return {
        ok: false,
        capacityFailure: { code: error.code, message: error.message, details: error.toJSON() },
      };
    if (isOperationAccessDeniedError(error) && error.subscriptionRequired)
      return {
        ok: false,
        capacityFailure: { code: "subscription_required", message: error.message },
      };
    throw error;
  }
}

/** Restore the caller's normal rejected-promise flow after showing structured capacity data. */
export function capacityActionClient<A extends unknown[], T>(
  action: (...args: A) => Promise<T | CapacityFailure>,
) {
  return async (...args: A): Promise<T> => {
    const result = await withCapacityFailure(() => action(...args));
    if (isCapacityFailure(result)) {
      publishCapacityNotice(result.capacityFailure);
      throw Object.assign(new Error(result.capacityFailure.message), result.capacityFailure);
    }
    return result as T;
  };
}

/** Nested server actions retain the domain error until the outer transport boundary. */
export function capacityActionServer<A extends unknown[], T>(
  action: (...args: A) => Promise<T | CapacityFailure>,
) {
  return async (...args: A): Promise<T> => {
    const result = await action(...args);
    if (isCapacityFailure(result)) {
      const failure = result.capacityFailure;
      if (failure.details) throw new CapacityLimitError(failure.details, failure.message);
      throw new OperationAccessDeniedError({ subscriptionRequired: true });
    }
    return result as T;
  };
}
