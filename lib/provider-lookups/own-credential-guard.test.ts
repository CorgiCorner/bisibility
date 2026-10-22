import { describe, expect, it } from "vitest";
import { assertOwnCredentialSnapshot } from "./own-credential-guard";

describe("accepted payment source", () => {
  it.each([
    ["own", "hosted"],
    ["hosted", "own"],
  ])("refuses %s to %s before execution", (expected, current) => {
    expect(() =>
      assertOwnCredentialSnapshot(
        {
          connection: { credentialsEncrypted: "key-a" },
          requiredPaymentSnapshot: { credentialSource: expected, credentialsEncrypted: "key-a" },
        } as Parameters<typeof assertOwnCredentialSnapshot>[0],
        {
          credentialSource: current,
          credentialsEncrypted: "key-a",
        },
      ),
    ).toThrow("payment_quote_changed");
  });
  it("refuses key rotation on an accepted own-key payment", () => {
    expect(() =>
      assertOwnCredentialSnapshot(
        {
          connection: { credentialsEncrypted: "key-a" },
          requiredPaymentSnapshot: { credentialSource: "own", credentialsEncrypted: "key-a" },
        } as Parameters<typeof assertOwnCredentialSnapshot>[0],
        {
          credentialSource: "own",
          credentialsEncrypted: "key-b",
        },
      ),
    ).toThrow("payment_quote_changed");
  });
});
