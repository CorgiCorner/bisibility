import { describe, expect, it } from "vitest";
import { presentCloudBackupActionError } from "./cloud-backup-action-error";

const sharedErrors = {
  genericFallback: () => "Shared fallback",
  rateLimited: () => "Rate limited",
  serverComponentDigest: ({ digest }: { digest: string }) => `Server reference ${digest}`,
  staleDeployment: () => "Refresh before trying again",
  verificationFailed: () => "Verification failed",
};

const messages = {
  exportFallback: () => "Package export failed",
  keywordLimit: ({ limit }: { limit: number }) => `Package limit: ${limit} keywords`,
  rankCheckLimit: ({ limit }: { limit: number }) => `Package limit: ${limit} rank checks`,
  unsupportedHistory: () => "Unsupported rank-check history",
};

describe("presentCloudBackupActionError", () => {
  it("maps stable package limits without exposing their server wording", () => {
    expect(
      presentCloudBackupActionError(
        new Error("Instance import package downloads currently support up to 1,200 keywords."),
        sharedErrors,
        messages,
      ),
    ).toBe("Package export failed");
    expect(
      presentCloudBackupActionError(
        new Error("Instance import package downloads currently support up to 1200 keywords."),
        sharedErrors,
        messages,
      ),
    ).toBe("Package limit: 1200 keywords");
    expect(
      presentCloudBackupActionError(
        new Error(
          "Instance import package downloads currently support up to 5000 checks per keyword.",
        ),
        sharedErrors,
        messages,
      ),
    ).toBe("Package limit: 5000 rank checks");
    expect(
      presentCloudBackupActionError(
        new Error("Completed rank check is missing a supported normalization version."),
        sharedErrors,
        messages,
      ),
    ).toBe("Unsupported rank-check history");
  });

  it("keeps stale deployments and server digests actionable", () => {
    expect(
      presentCloudBackupActionError(
        new Error("Failed to find Server Action"),
        sharedErrors,
        messages,
      ),
    ).toBe("Refresh before trying again");

    const digest = Object.assign(new Error("Server Components render failed"), {
      digest: "digest_abc",
    });
    expect(presentCloudBackupActionError(digest, sharedErrors, messages)).toBe(
      "Server reference digest_abc",
    );
  });

  it("keeps unknown diagnostics out of the shell", () => {
    const diagnostic = "project=prj_1 provider response: internal details";

    expect(presentCloudBackupActionError(new Error(diagnostic), sharedErrors, messages)).toBe(
      "Package export failed",
    );
  });
});
