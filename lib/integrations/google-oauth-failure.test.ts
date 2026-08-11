import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GOOGLE_OAUTH_FAILURE_REASONS,
  GoogleOAuthInstallError,
  googleOAuthFailureFrom,
  logGoogleOAuthFailure,
} from "./google-oauth-failure";

const SECRET_FIXTURE = {
  token: "1//refresh_token_secret_fixture",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GoogleOAuthInstallError", () => {
  it("keeps the structured failure fields on the error", () => {
    const error = new GoogleOAuthInstallError("state_expired", "Google OAuth state has expired.", {
      projectId: "project_1",
      provider: "gsc",
      returnPath: "/app/integrations",
    });

    expect(error.reason).toBe("state_expired");
    expect(error.projectId).toBe("project_1");
    expect(error.provider).toBe("gsc");
    expect(error.returnPath).toBe("/app/integrations");
    expect(error.name).toBe("GoogleOAuthInstallError");
  });

  it("returns null reason for non-install errors", () => {
    const failure = googleOAuthFailureFrom(new Error("Something bad happened"));

    expect(failure.reason).toBeNull();
  });

  it("returns null for unknown reasons", () => {
    const error = new GoogleOAuthInstallError("unknown_reason" as never, "Unknown");
    expect(googleOAuthFailureFrom(error).reason).toBeNull();
  });
});

describe("GOOGLE_OAUTH_FAILURE_REASONS", () => {
  it("includes credentials_decrypt in the closed set", () => {
    expect(GOOGLE_OAUTH_FAILURE_REASONS).toContain("credentials_decrypt");
  });
});

describe("googleOAuthFailureFrom", () => {
  it("preserves the install reason and context", () => {
    const error = new GoogleOAuthInstallError("token_exchange", "Exchange failed.", {
      projectId: "project_1",
      provider: "gsc",
      returnPath: "/app/integrations",
    });

    const failure = googleOAuthFailureFrom(error);

    expect(failure).toMatchObject({
      reason: "token_exchange",
      projectId: "project_1",
      provider: "gsc",
      returnPath: "/app/integrations",
    });
  });

  it("keeps a classified install error on its reason without cause diagnostics", () => {
    const error = new GoogleOAuthInstallError(
      "token_exchange",
      "wrapped cause: TypeError: fetch failed",
      {
        projectId: "project_1",
        provider: "gsc",
        returnPath: "/app/integrations",
      },
    );

    const failure = googleOAuthFailureFrom(error);

    // A classified failure already names the stage; cause diagnostics belong to unclassified
    // throws and must not leak authored messages into the log.
    expect(failure).toMatchObject({
      reason: "token_exchange",
      projectId: "project_1",
      provider: "gsc",
      returnPath: "/app/integrations",
    });
    expect(failure.causeClass).toBeUndefined();
    expect(failure.causeMessage).toBeUndefined();
  });

  it("captures the cause class and message for a plain error", () => {
    const error = new Error(`Failed with refresh token: ${SECRET_FIXTURE.token}`);

    const failure = googleOAuthFailureFrom(error);

    expect(failure.causeClass).toBe("Error");
    expect(failure.causeMessage).toContain("[REDACTED]");
    expect(failure.causeMessage).not.toContain(SECRET_FIXTURE.token);
  });

  it("captures the cause class and message for a non-error thrown value", () => {
    const failure = googleOAuthFailureFrom("plain string failure");

    expect(failure.causeClass).toBeUndefined();
    expect(failure.causeMessage).toBe("plain string failure");
  });

  it("redacts a secret-bearing non-error thrown value", () => {
    const failure = googleOAuthFailureFrom(`refresh token: ${SECRET_FIXTURE.token}`);

    expect(failure.causeClass).toBeUndefined();
    expect(failure.causeMessage).toContain("[REDACTED]");
    expect(failure.causeMessage).not.toContain(SECRET_FIXTURE.token);
  });
});

describe("logGoogleOAuthFailure", () => {
  it("emits one line with cause class and redacted cause message when provided", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logGoogleOAuthFailure({
      causeClass: "Error",
      causeMessage: `Decryption failed with refresh token: ${SECRET_FIXTURE.token}`,
      googleError: null,
      projectId: "project_1",
      provider: "gsc",
      reason: null,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toBe("[google-oauth] install failed");
    const entry = spy.mock.calls[0]?.[1] as {
      causeClass?: string;
      causeMessage?: string;
      reason?: string;
    };
    expect(entry.causeClass).toBe("Error");
    expect(entry.causeMessage).toContain("[REDACTED]");
    expect(entry.causeMessage).not.toContain(SECRET_FIXTURE.token);
    expect(entry.reason).toBe("unclassified");

    spy.mockRestore();
  });

  it("omits cause fields when no error is attached", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logGoogleOAuthFailure({
      googleError: null,
      projectId: "project_1",
      provider: "gsc",
      reason: null,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const entry = spy.mock.calls[0]?.[1] as { causeClass?: string; causeMessage?: string };
    expect(entry.causeClass).toBeUndefined();
    expect(entry.causeMessage).toBeUndefined();

    spy.mockRestore();
  });
});
