import { describe, expect, it } from "vitest";
import {
  actionErrorMessage,
  isStaleDeploymentError,
  STALE_DEPLOYMENT_MESSAGE,
} from "./action-error";

describe("actionErrorMessage", () => {
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

  it("passes through regular error messages", () => {
    expect(actionErrorMessage(new Error("Keyword limit reached."))).toBe("Keyword limit reached.");
  });

  it("returns the fallback for non-Error values and empty messages", () => {
    expect(actionErrorMessage("boom")).toBe("The action could not be completed.");
    expect(actionErrorMessage(null, "Could not save.")).toBe("Could not save.");
    expect(actionErrorMessage(new Error(""), "Could not save.")).toBe("Could not save.");
  });
});
