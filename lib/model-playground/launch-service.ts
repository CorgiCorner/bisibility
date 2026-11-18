import type {
  ModelColumnResult,
  ModelMoney,
  ModelPlaygroundInput,
  ModelPlaygroundLaunch,
} from "./types";

export type ModelPlaygroundQuote = {
  revision: string;
  previewId: string;
  configHash: string;
  quoteToken: string;
  expiresAt: string;
  forecasts: { columnId: string; money: ModelMoney; complete: boolean }[];
};
export type ModelPlaygroundLaunchResult = {
  runId: string;
  reportId?: string;
  columns: ModelColumnResult[];
  progress?: { columnId: string; state: string; poll?: boolean }[];
  columnAttempts?: Record<string, string>;
  replayed?: boolean;
  replacementRefusal?: { reason: string; quoteInvalidated: boolean };
};

export type ModelPlaygroundConfirmationRequired = {
  kind: "confirmation_required";
  nonce: string;
  contentHash: string;
  attemptIds: string[];
  earlierAttemptUnconfirmed: true;
};
export type ModelPlaygroundLaunchRequest = ModelPlaygroundLaunch & {
  revision: string;
  confirmUnknown?: Pick<
    ModelPlaygroundConfirmationRequired,
    "nonce" | "contentHash" | "attemptIds"
  >;
};
export function isModelPlaygroundConfirmation(
  error: unknown,
): error is ModelPlaygroundConfirmationRequired {
  if (!error || typeof error !== "object") return false;
  const value = error as Partial<ModelPlaygroundConfirmationRequired>;
  return (
    value.kind === "confirmation_required" &&
    typeof value.nonce === "string" &&
    typeof value.contentHash === "string" &&
    /^[a-f0-9]{64}$/.test(value.contentHash) &&
    Array.isArray(value.attemptIds) &&
    value.attemptIds.length > 0 &&
    value.attemptIds.every((id) => typeof id === "string") &&
    value.earlierAttemptUnconfirmed === true
  );
}

/** Definite only before dispatch, including admission with every attempt durably refused. */
export type ModelPlaygroundLaunchRejection =
  | { kind: "not_dispatched" | "access_denied" | "feature_disabled"; message: string }
  | { kind: "run_not_created"; message: string }
  | {
      kind: "invalid_request";
      reason: "validation_failed" | "not_found";
      message: string;
    };

export function isModelPlaygroundLaunchRejection(
  error: unknown,
): error is ModelPlaygroundLaunchRejection {
  return (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    [
      "not_dispatched",
      "access_denied",
      "feature_disabled",
      "invalid_request",
      "run_not_created",
    ].includes(String(error.kind)) &&
    "message" in error &&
    typeof error.message === "string" &&
    (error.kind !== "invalid_request" ||
      ("reason" in error && ["validation_failed", "not_found"].includes(String(error.reason))))
  );
}

/** Browser port: P12 wraps authenticated server actions; AbortSignal stays in the client.
 * P12 also implements ModelPlaygroundCatalogLoader from ./catalog-request for column refresh.
 * Preview is free and never dispatches a model.
 * Launch may reject with ModelPlaygroundLaunchRejection only when dispatch is ruled out.
 * Deduplicate identical content server-side within a window, including across page remounts. */
export type ModelPlaygroundLaunchService = {
  read?(runId: string): Promise<ModelPlaygroundLaunchResult | null>;
  preview(
    request: { revision: string; input: ModelPlaygroundInput },
    signal: AbortSignal,
  ): Promise<ModelPlaygroundQuote>;
  launch(request: ModelPlaygroundLaunchRequest): Promise<ModelPlaygroundLaunchResult>;
};
