import type { SharedErrorMessages } from "@/lib/ui/action-error";
import { describe, expect, it } from "vitest";
import { presentBulkActionError } from "./bulk-action-error";

const sharedErrors: SharedErrorMessages = {
  genericFallback: () => "fallback",
  rateLimited: () => "rate limited",
  serverComponentDigest: ({ digest }) => `digest ${digest}`,
  staleDeployment: () => "refresh",
  verificationFailed: () => "verification",
};

describe("presentBulkActionError", () => {
  it("does not expose an unknown action diagnostic", () => {
    expect(
      presentBulkActionError(
        new Error("provider token expired: private detail"),
        sharedErrors,
        "retry",
      ),
    ).toBe("retry");
  });

  it("keeps shared stale and digest recovery available", () => {
    expect(
      presentBulkActionError(
        new Error("This request might be from an older or newer deployment."),
        sharedErrors,
        "retry",
      ),
    ).toBe("refresh");
    expect(
      presentBulkActionError(
        Object.assign(new Error("Server Components render failed."), { digest: "abc123" }),
        sharedErrors,
        "retry",
      ),
    ).toBe("digest abc123");
  });
});
