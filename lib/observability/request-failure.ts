import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { reportServerMessage } from "./server-message";

export type RequestFailureStage =
  | "request"
  | "credential_auth"
  | "oauth_auth"
  | "oauth_verify"
  | "oauth_scope"
  | "user_lookup"
  | "rate_limit"
  | "client_gate"
  | "server_create"
  | "server_connect"
  | "transport_handle"
  | "tool_dispatch"
  | "api_dispatch"
  | "response_encode";

type FailureContext = {
  clientSignal: AbortSignal;
  correlationId: string;
  logged: boolean;
  operationId?: string;
  httpStatus?: number;
  signal: AbortSignal;
  stage: RequestFailureStage;
  started: number;
  rpcMethod: string;
  toolName: string;
};
type RequestFailureMetadata = Pick<FailureContext, "rpcMethod" | "toolName" | "httpStatus">;
const contexts = new AsyncLocalStorage<FailureContext>();
const errorNames = new Set([
  "Error",
  "APIError",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "AbortError",
  "TimeoutError",
  "PrismaClientKnownRequestError",
  "PrismaClientUnknownRequestError",
  "PrismaClientInitializationError",
  "ProviderRateLimitedError",
  "ProviderAuthError",
  "RankCheckRunnerError",
]);
const transientCodes = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "EPIPE",
  "ENETUNREACH",
  "P1001",
  "P1002",
  "P1008",
  "P1017",
  "P2024",
  "57P01",
  "57P03",
  "53300",
]);
const knownCodes = new Set([...transientCodes, "P2021", "P2022", "P2002", "42P01", "42703"]);
const sourceFiles = [
  "lib/mcp/transport.ts",
  "lib/mcp/oauth-auth.ts",
  "lib/mcp/client-version-gate.ts",
  "lib/mcp/server.ts",
  "lib/mcp/rest-call.ts",
  "lib/api/auth.ts",
  "lib/api/router.ts",
  "lib/api/ratelimit.ts",
  "lib/redis/redis.ts",
  "lib/auth/oauth-consent-guard.ts",
  "lib/queries/oauth-consent.ts",
  "lib/providers/analytics/google-client.ts",
];

/** Omit messages, arbitrary properties and untrusted stack text, including nested causes. */
export function safeFailureCauses(error: unknown) {
  const causes: Array<{ errorClass: string; code?: string; frames: string[] }> = [];
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && causes.length < 4 && !seen.has(current)) {
    seen.add(current);
    const value = current as { name?: unknown; code?: unknown; stack?: unknown; cause?: unknown };
    const errorClass =
      typeof value.name === "string" && errorNames.has(value.name) ? value.name : "Error";
    const code =
      typeof value.code === "string" && knownCodes.has(value.code) ? value.code : undefined;
    const stack = typeof value.stack === "string" ? value.stack.slice(0, 8_192) : "";
    const frames = sourceFiles
      .flatMap((file) => {
        const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- fixed module path is escaped; stack and digit lengths are bounded.
        const location = new RegExp(`${escaped}:(\\d{1,7}):(\\d{1,5})(?:\\)|\\s|$)`).exec(stack);
        return location ? [`${file}:${location[1]}:${location[2]}`] : [];
      })
      .slice(0, 5);
    const compiled =
      /\.next\/server\/chunks\/(?:ssr\/)?[^\s/()]*?([a-f0-9]{8,32})\.js:(\d{1,7}):(\d{1,5})(?:\)|\s|$)/.exec(
        stack,
      );
    if (compiled) frames.push(`server-chunk:${compiled[1]}:${compiled[2]}:${compiled[3]}`);
    causes.push({ errorClass, ...(code ? { code } : {}), frames });
    current = value.cause;
  }
  return causes;
}

export function isTransientRequestFailure(error: unknown) {
  try {
    return safeFailureCauses(error).some(
      (cause) =>
        cause.errorClass === "TimeoutError" ||
        Boolean(cause.code && transientCodes.has(cause.code)),
    );
  } catch {
    return false;
  }
}

export function withRequestFailureContext<T>(signal: AbortSignal, operation: () => Promise<T>) {
  return contexts.run(
    {
      clientSignal: signal,
      correlationId: randomUUID(),
      logged: false,
      signal,
      stage: "request",
      started: performance.now(),
      rpcMethod: "unknown",
      toolName: "unknown",
    },
    operation,
  );
}

export function requestFailureContext() {
  return contexts.getStore();
}

/** A batch shares HTTP correlation but each tool retains its own failure evidence. */
export function withRequestFailureScope<T>(
  stage: RequestFailureStage,
  operation: () => Promise<T>,
) {
  const context = contexts.getStore();
  return context
    ? contexts.run({ ...context, logged: false, operationId: randomUUID(), stage }, operation)
    : operation();
}

export function setRequestFailureMetadata(metadata: RequestFailureMetadata) {
  const context = contexts.getStore();
  if (context) {
    context.rpcMethod = metadata.rpcMethod;
    context.toolName = metadata.toolName;
    context.httpStatus = metadata.httpStatus;
  }
}

export function setRequestFailureStage(stage: RequestFailureStage) {
  const context = contexts.getStore();
  if (context) context.stage = stage;
}

/** Only an explicitly scoped request is reported; routine REST calls remain unchanged. */
export function reportRequestFailure(error: unknown, stage?: RequestFailureStage, status = 500) {
  const context = contexts.getStore();
  if (!context || context.logged || context.clientSignal.aborted || status < 500) return;
  context.logged = true;
  try {
    const release = process.env.VERCEL_GIT_COMMIT_SHA;
    const causes = safeFailureCauses(error);
    const phase = stage ?? context.stage;
    const causeClass = causes[0]?.errorClass ?? "Error";
    const diagnostic = {
      correlationId: context.correlationId,
      ...(context.operationId ? { operationId: context.operationId } : {}),
      phase,
      causeClass,
      rpcMethod: context.rpcMethod,
      toolName: context.toolName,
      durationMs: Math.round(performance.now() - context.started),
      status,
      httpStatus: context.httpStatus ?? status,
      causes,
      ...(/^[a-f0-9]{40}$/.test(release ?? "") ? { release } : {}),
    };
    console.error("[mcp] request failed", { ...diagnostic, stage: phase });
    if (process.env.SENTRY_DSN?.trim() || process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()) {
      void reportServerMessage("MCP request failed", {
        level: "error",
        fingerprint: [
          "mcp-request",
          phase,
          causeClass,
          causes[0]?.code ?? "unknown",
          context.rpcMethod,
        ],
        extra: { ...diagnostic, causes: JSON.stringify(diagnostic.causes) },
      }).catch(() => undefined);
    }
  } catch {
    // A diagnostic sink must never replace the protocol response.
  }
}
