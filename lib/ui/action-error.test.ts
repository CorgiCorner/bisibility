import { describe, expect, it } from "vitest";
import {
  actionErrorMessage,
  isStaleDeploymentError,
  STALE_DEPLOYMENT_MESSAGE,
} from "./action-error";

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
