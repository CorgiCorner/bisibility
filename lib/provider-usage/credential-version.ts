import { createHash } from "node:crypto";

/** A retained version of the encrypted credential binding, never an upstream account identity. */
export function ownCredentialVersion(
  provider: string,
  connectionId: string,
  envelope?: string | null,
) {
  return envelope
    ? createHash("sha256")
        .update(JSON.stringify([provider, connectionId, envelope]))
        .digest("hex")
    : null;
}

export function ownAllocationTag(provider: string, connectionId: string) {
  return createHash("sha256")
    .update(JSON.stringify(["own-allocation", provider, connectionId]))
    .digest("hex");
}
