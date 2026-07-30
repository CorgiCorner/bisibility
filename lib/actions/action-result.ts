import {
  MigrationTokenAlreadyConsumedError,
  MigrationTokenNotActiveError,
} from "@/lib/actions/migration-errors";
import { ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";

export type ActionFailure =
  | {
      code: "enrollment_expired";
      message: string;
      status: 410;
    }
  | {
      code: "invalid_migration_target";
      message: string;
      status: 400;
    }
  | {
      code: "invalid_input";
      message: string;
      status: 400;
    }
  | {
      code: "migration_token_not_active";
      message: string;
      status: 409;
    }
  | {
      code: "migration_token_already_consumed";
      message: string;
      status: 409;
    }
  | {
      code: "project_read_only";
      message: string;
      status: 423;
    }
  | {
      code: "rate_limited";
      message: string;
      status: 429;
    }
  | {
      code: "remote_migration_rejected";
      message: string;
      status: number;
    }
  | {
      code: "session_not_fresh";
      message: string;
      status: 403;
    }
  | {
      code: "step_up_failed";
      message: string;
      status: 401;
    }
  | {
      code: "step_up_locked";
      message: string;
      status: 429;
    }
  | {
      code: "unavailable";
      message: string;
      status: 503;
    };

export type ActionFailureResult = {
  error: ActionFailure;
  ok: false;
};

export type ActionResult<T> = { ok: true; value: T } | ActionFailureResult;

const TOKEN_NOT_ACTIVE_MESSAGE =
  "This migration token is no longer active. Create a new token to continue.";
const TOKEN_ALREADY_CONSUMED_MESSAGE =
  "This migration token has already been used. Create a new token to continue.";

// Maps known domain errors to their typed handled failure. Unknown errors return
// null so callers rethrow and keep programming/authz bugs visible.
export function mapActionFailure(error: unknown): ActionFailure | null {
  if (error instanceof ProjectReadOnlyError) {
    return { code: error.code, message: error.message, status: error.status };
  }
  if (error instanceof MigrationTokenNotActiveError) {
    return { code: "migration_token_not_active", message: TOKEN_NOT_ACTIVE_MESSAGE, status: 409 };
  }
  if (error instanceof MigrationTokenAlreadyConsumedError) {
    return {
      code: "migration_token_already_consumed",
      message: TOKEN_ALREADY_CONSUMED_MESSAGE,
      status: 409,
    };
  }
  return null;
}

// Known destination rejections are safe without details; other 4xx require readable details.
// Server errors and non-4xx responses remain unhandled.
const DESTINATION_REJECTION_STATUSES = new Set<number>([409, 419, 423]);
const DESTINATION_REJECTION_MESSAGES: Record<number, string> = {
  409: "The destination reported a conflict for this migration.",
  419: "The migration token was revoked or expired on the destination.",
  423: "The destination project is locked while another migration finishes.",
};

export function destinationRejectionFailure(
  status: number,
  detail: string | null,
): ActionFailure | null {
  if (status < 400 || status >= 500) return null;
  const known = DESTINATION_REJECTION_STATUSES.has(status);
  if (!known && !detail) return null;
  return {
    code: "remote_migration_rejected",
    message:
      detail ?? DESTINATION_REJECTION_MESSAGES[status] ?? "The destination rejected the migration.",
    status,
  };
}

export async function handledActionResult<T>(run: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    const failure = mapActionFailure(error);
    if (failure) return { error: failure, ok: false };
    throw error;
  }
}

export function actionFailureResult(error: ActionFailure): ActionFailureResult {
  return { error, ok: false };
}

function throwActionFailure(error: ActionFailure): never {
  throw Object.assign(new Error(error.message), {
    code: error.code,
    status: error.status,
  });
}

export function unwrapActionFailureResult<T>(result: T | ActionFailureResult): T {
  if (result && typeof result === "object" && "ok" in result && result.ok === false) {
    return throwActionFailure(result.error);
  }
  return result as T;
}

export function unwrapActionResult<T>(result: ActionResult<T>): T {
  if (result.ok) return result.value;
  return throwActionFailure(result.error);
}
