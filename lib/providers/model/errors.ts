const MESSAGES = {
  invalid_request: "Model request is not allowed.",
  observer_required: "Model generation requires an accounting observer.",
  admission_refused: "Model request admission was refused.",
  invalid_credentials: "Model credentials were rejected.",
  refused: "Model request was refused.",
  rate_limited: "Model request was rate limited.",
  provider_error: "Model provider failed.",
  invalid_response: "Model provider returned an invalid response.",
  timeout: "Model request deadline expired.",
  aborted: "Model request was cancelled.",
  network_error: "Model provider could not be reached.",
  accounting_unknown: "Model request accounting could not be confirmed.",
} as const;

export type ModelTransportErrorCode = keyof typeof MESSAGES;

export const WORKSPACE_MESSAGES = {
  selection_missing:
    "Possible cause: if this key is not tied to one workspace, set a Workspace ID.",
  selection:
    "Possible cause: check the Workspace ID. A workspace-scoped key must use its own workspace.",
  access: "Choose a workspace this key can access, or use a key authorized for that workspace.",
} as const;

/** Dispatch flags refer to paid generation. Never retain upstream errors or causes. */
export class ModelTransportError extends Error {
  readonly financialExposure: "unknown" | "not_dispatched";

  constructor(
    readonly code: ModelTransportErrorCode,
    readonly dispatched = false,
    readonly requestId: string | null = null,
    readonly workspaceIssue?: keyof typeof WORKSPACE_MESSAGES,
    readonly httpStatus?: number,
  ) {
    super(MESSAGES[code] + (workspaceIssue ? ` Hint: ${WORKSPACE_MESSAGES[workspaceIssue]}` : ""));
    this.name = "ModelTransportError";
    this.financialExposure = dispatched ? "unknown" : "not_dispatched";
  }
}

export function statusErrorCode(status: number): ModelTransportErrorCode {
  if (status === 401) return "invalid_credentials";
  if (status === 403) return "refused";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_error";
  return "invalid_response";
}
