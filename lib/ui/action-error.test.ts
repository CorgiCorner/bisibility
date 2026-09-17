import { describe, expect, it } from "vitest";
import {
  actionErrorMessage,
  isStaleDeploymentError,
  presentActionError,
  presentWaitlistError,
  presentWaitlistFailure,
  type SharedErrorMessages,
  STALE_DEPLOYMENT_MESSAGE,
  waitlistErrorMessage,
} from "./action-error";

const localizedMessages = {
  genericFallback: () => "Nie można ukończyć działania.",
  rateLimited: () => "Zbyt wiele żądań. Spróbuj ponownie później.",
  serverComponentDigest: ({ digest }: { digest: string }) =>
    `Sprawdzenie nie powiodło się po naszej stronie (nr ${digest}). Spróbuj ponownie za chwilę.`,
  staleDeployment: () =>
    "bisibility zostało zaktualizowane, gdy ta strona była otwarta. Odśwież aplikację, aby kontynuować. Niezapisane zmiany zostaną utracone.",
  verificationFailed: () => "Weryfikacja nie powiodła się. Spróbuj ponownie.",
} satisfies SharedErrorMessages;

describe("explicit shared error presentation", () => {
  it("renders a stale deployment using the injected locale without mutable global state", () => {
    expect(
      presentActionError(
        new Error("This request might be from an older or newer deployment."),
        localizedMessages,
      ),
    ).toBe(localizedMessages.staleDeployment());
  });

  it("keeps the injected locale isolated across stale, digest, rate, and verification states", () => {
    const digest = Object.assign(
      new Error("An unexpected response was received from the server."),
      {
        digest: "4186352953",
      },
    );

    expect(presentActionError(digest, localizedMessages)).toBe(
      "Sprawdzenie nie powiodło się po naszej stronie (nr 4186352953). Spróbuj ponownie za chwilę.",
    );
    expect(
      presentWaitlistError(
        new Error("Too many requests. Please try again later."),
        localizedMessages,
        "Nie można wysłać formularza.",
      ),
    ).toBe("Zbyt wiele żądań. Spróbuj ponownie później.");
    expect(presentWaitlistFailure("verification_failed", localizedMessages)).toBe(
      "Weryfikacja nie powiodła się. Spróbuj ponownie.",
    );
  });

  it("uses the feature fallback for empty and non-Error action values", () => {
    expect(presentActionError(null, localizedMessages, "Nie można zapisać.")).toBe(
      "Nie można zapisać.",
    );
    expect(presentActionError(new Error(""), localizedMessages, "Nie można zapisać.")).toBe(
      "Nie można zapisać.",
    );
  });

  it("does not hide a missing scoped message behind English text", () => {
    const missingStaleMessage: SharedErrorMessages = {
      ...localizedMessages,
      staleDeployment: () => {
        throw new Error("Missing message: shared.errors.staleDeployment");
      },
    };

    expect(() =>
      presentActionError(
        new Error("This request might be from an older or newer deployment."),
        missingStaleMessage,
      ),
    ).toThrow("Missing message: shared.errors.staleDeployment");
  });
});

describe("actionErrorMessage", () => {
  it("maps production server-component digest errors to a friendly reference", () => {
    const error = Object.assign(
      new Error(
        "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.",
      ),
      { digest: "4186352953", internalDetail: "must stay private" },
    );

    expect(actionErrorMessage(error)).toBe(
      "Check failed on our side (ref 4186352953). Retry in a moment.",
    );
  });

  it("maps message-less server-component digest errors to a friendly reference", () => {
    const error = Object.assign(
      new Error("An error occurred in the Server Components render but no message was provided"),
      { digest: "4186352953" },
    );

    expect(actionErrorMessage(error)).toBe(
      "Check failed on our side (ref 4186352953). Retry in a moment.",
    );
  });

  it("maps unexpected server-action response digest errors to a friendly reference", () => {
    const error = Object.assign(new Error("An unexpected response was received from the server."), {
      digest: "4186352953",
    });

    expect(actionErrorMessage(error)).toBe(
      "Check failed on our side (ref 4186352953). Retry in a moment.",
    );
  });

  it("maps stale server-action errors to the refresh message", () => {
    expect(
      actionErrorMessage(
        new Error(
          'Failed to find Server Action "409f3c…". This request might be from an older or newer deployment.',
        ),
      ),
    ).toBe(STALE_DEPLOYMENT_MESSAGE);
    expect(
      actionErrorMessage(new Error("This request might be from an older or newer deployment.")),
    ).toBe(STALE_DEPLOYMENT_MESSAGE);
    expect(
      actionErrorMessage(
        new Error(
          'Server Action "4060ab4747e8669a2966edc772d11ed4d763a28cbc" was not found on the server.',
        ),
      ),
    ).toBe(STALE_DEPLOYMENT_MESSAGE);
  });

  it("classifies stale deployment errors without matching provider failures", () => {
    expect(
      isStaleDeploymentError(new Error('Server Action "abc" was not found on the server.')),
    ).toBe(true);
    expect(isStaleDeploymentError(new Error("Provider request failed."))).toBe(false);
  });

  it("passes through regular error messages, including errors with a digest", () => {
    expect(actionErrorMessage(new Error("Keyword limit reached."))).toBe("Keyword limit reached.");
    expect(
      actionErrorMessage(Object.assign(new Error("Provider request failed."), { digest: "123" })),
    ).toBe("Provider request failed.");
  });

  it("returns the fallback for non-Error values and empty messages", () => {
    expect(actionErrorMessage("boom")).toBe("The action could not be completed.");
    expect(actionErrorMessage(null, "Could not save.")).toBe("Could not save.");
    expect(actionErrorMessage(new Error(""), "Could not save.")).toBe("Could not save.");
  });
});

describe("waitlistErrorMessage", () => {
  it("maps verification failures to the stable neutral message", () => {
    expect(
      waitlistErrorMessage(new Error("Verification failed. Please try again."), "Fallback"),
    ).toBe("Verification failed. Please try again.");
  });

  it("maps rate-limit failures to the stable neutral message", () => {
    expect(
      waitlistErrorMessage(new Error("Too many requests. Please try again later."), "Fallback"),
    ).toBe("Too many requests. Please try again later.");
  });

  it("maps stale deployment errors to the refresh message", () => {
    expect(
      waitlistErrorMessage(
        new Error(
          'Failed to find Server Action "abc". This request might be from an older or newer deployment.',
        ),
        "Fallback",
      ),
    ).toBe(STALE_DEPLOYMENT_MESSAGE);
  });

  it("returns the fallback for unknown infrastructure errors without exposing raw details", () => {
    expect(
      waitlistErrorMessage(
        new Error("fetch failed at https://internal.example.com/api"),
        "Unable to submit right now.",
      ),
    ).toBe("Unable to submit right now.");
  });

  it("returns the fallback for non-Error values", () => {
    expect(waitlistErrorMessage("boom", "Unable to submit.")).toBe("Unable to submit.");
    expect(waitlistErrorMessage(null, "Unable to submit.")).toBe("Unable to submit.");
  });

  it("does not expose unknown provider, URL, or non-Error details through localized presentation", () => {
    const fallback = "Nie można wysłać formularza.";
    expect(
      presentWaitlistError(
        new Error("Provider failed at https://internal.example.com/private?token=secret"),
        localizedMessages,
        fallback,
      ),
    ).toBe(fallback);
    expect(presentWaitlistError({ detail: "secret" }, localizedMessages, fallback)).toBe(fallback);
  });
});
