import type { SharedErrorMessages } from "@/lib/ui/action-error";
import { describe, expect, it } from "vitest";
import { presentAdminActionError } from "./admin-action-error";

const messages: SharedErrorMessages = {
  genericFallback: () => "generic",
  rateLimited: () => "limited",
  serverComponentDigest: ({ digest }) => `digest ${digest}`,
  staleDeployment: () => "stale",
  verificationFailed: () => "verification",
};

describe("presentAdminActionError", () => {
  it("keeps shared stale-deployment and digest recovery actionable", () => {
    expect(
      presentAdminActionError(
        new Error("Failed to find Server Action while this page was open"),
        messages,
        "admin fallback",
      ),
    ).toBe("stale");

    const digestError = Object.assign(
      new Error("An unexpected response was received from the server"),
      { digest: "digest_123" },
    );
    expect(presentAdminActionError(digestError, messages, "admin fallback")).toBe(
      "digest digest_123",
    );
  });

  it("does not turn unknown action diagnostics into user-facing instructions", () => {
    expect(
      presentAdminActionError(new Error("upstream password=secret"), messages, "admin fallback"),
    ).toBe("admin fallback");
  });
});
