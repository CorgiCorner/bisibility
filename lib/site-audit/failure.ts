const failureMessages = {
  timeout: "The page request timed out.",
  dns: "The public hostname could not be resolved.",
  tls: "The secure connection could not be verified.",
  network: "The connection to the page failed.",
  public_network: "The URL failed the public-network safety check.",
  redirect: "The redirect leaves the project origin or uses a blocked URL.",
  redirect_limit: "The page exceeded the redirect limit.",
  size_limit: "The page exceeded the response size limit.",
  request_limit: "The crawl reached its request limit.",
  unknown: "The page could not be fetched; no response was available.",
} as const;

export type AuditFailureReason = keyof typeof failureMessages;

function messageReason(message: string): AuditFailureReason | undefined {
  for (const [reason, safeMessage] of Object.entries(failureMessages)) {
    if (message === safeMessage) return reason as AuditFailureReason;
  }
  if (message === "Audit time limit reached.") return "timeout";
  if (message === "Audit request limit reached.") return "request_limit";
  if (
    message === "Project domain has no public DNS addresses." ||
    message.startsWith("Webhook URL targets a private-network target.")
  )
    return "public_network";
  if (message === "Redirect outside the project origin is blocked.") return "redirect";
  if (message === "Page exceeds the three-redirect audit limit.") return "redirect_limit";
  if (message === "Page exceeds the 512 KiB audit limit.") return "size_limit";
  if (/^(getaddrinfo )?(ENOTFOUND|EAI_AGAIN)\b/.test(message)) return "dns";
  return undefined;
}

function codeReason(code: unknown): AuditFailureReason | undefined {
  if (typeof code !== "string") return undefined;
  if (["ENOTFOUND", "EAI_AGAIN"].includes(code)) return "dns";
  if (
    [
      "ETIMEDOUT",
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_HEADERS_TIMEOUT",
      "UND_ERR_BODY_TIMEOUT",
    ].includes(code)
  )
    return "timeout";
  if (["ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH"].includes(code))
    return "network";
  if (
    [
      "CERT_HAS_EXPIRED",
      "DEPTH_ZERO_SELF_SIGNED_CERT",
      "SELF_SIGNED_CERT_IN_CHAIN",
      "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
      "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
      "ERR_TLS_CERT_ALTNAME_INVALID",
    ].includes(code)
  )
    return "tls";
  return undefined;
}

// Only allowlisted categories cross into saved reports and localized UI.
export function auditFailureReason(error: unknown): AuditFailureReason {
  const pending = [error];
  for (let count = 0; pending.length && count < 8; count++) {
    const current = pending.shift();
    if (typeof current === "string") {
      const reason = messageReason(current);
      if (reason) return reason;
    } else if (current && typeof current === "object") {
      const detail = current as {
        message?: unknown;
        name?: unknown;
        code?: unknown;
        cause?: unknown;
        errors?: unknown;
      };
      const reason =
        codeReason(detail.code) ??
        (typeof detail.message === "string" ? messageReason(detail.message) : undefined);
      if (reason) return reason;
      if (detail.name === "TimeoutError" || detail.name === "AbortError") return "timeout";
      if (detail.cause) pending.push(detail.cause);
      if (Array.isArray(detail.errors)) pending.push(...detail.errors.slice(0, 4));
    }
  }
  return "unknown";
}

export function auditFailureMessage(error: unknown): string {
  return failureMessages[auditFailureReason(error)];
}
