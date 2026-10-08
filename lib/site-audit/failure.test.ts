import { describe, expect, it } from "vitest";
import { auditFailureMessage, auditFailureReason } from "./failure";

describe("safe audit failure reasons", () => {
  it.each([
    ["Audit time limit reached.", "timeout"],
    ["Audit request limit reached.", "request_limit"],
    ["Project domain has no public DNS addresses.", "public_network"],
    [
      "Webhook URL targets a private-network target. Set WEBHOOK_ALLOW_PRIVATE_NETWORK=1 only for self-hosted internal delivery.",
      "public_network",
    ],
    ["Redirect outside the project origin is blocked.", "redirect"],
    ["Page exceeds the three-redirect audit limit.", "redirect_limit"],
    ["Page exceeds the 512 KiB audit limit.", "size_limit"],
    ["getaddrinfo ENOTFOUND internal.example.com", "dns"],
  ])("classifies legacy failure %s without exposing its message", (message, reason) => {
    expect(auditFailureReason(message)).toBe(reason);
    expect(auditFailureReason(auditFailureMessage(new Error(message)))).toBe(reason);
  });
  it.each([
    ["ENOTFOUND", "dns"],
    ["EAI_AGAIN", "dns"],
    ["CERT_HAS_EXPIRED", "tls"],
    ["ERR_TLS_CERT_ALTNAME_INVALID", "tls"],
    ["ECONNRESET", "network"],
    ["ENETUNREACH", "network"],
    ["UND_ERR_CONNECT_TIMEOUT", "timeout"],
  ])("uses nested transport code %s, never the private error detail", (code, reason) => {
    const error = new TypeError("fetch failed", {
      cause: Object.assign(new Error("token=secret-value"), { code }),
    });
    expect(auditFailureReason(error)).toBe(reason);
    expect(auditFailureMessage(error)).not.toContain("secret-value");
  });
  it("does not infer the root cause from generic fetch failures or arbitrary text", () => {
    for (const error of [new TypeError("fetch failed"), "password=secret-value", null]) {
      expect(auditFailureReason(error)).toBe("unknown");
      expect(auditFailureMessage(error)).toBe(
        "The page could not be fetched; no response was available.",
      );
    }
  });
  it("bounds cyclic causes and handles aggregate connection errors", () => {
    const cyclic = { cause: {} };
    cyclic.cause = cyclic;
    expect(auditFailureReason(cyclic)).toBe("unknown");
    expect(auditFailureReason(new AggregateError([{ code: "ECONNREFUSED" }]))).toBe("network");
  });
});
