import { createHash, randomBytes } from "node:crypto";

/** 32 random bytes, base64url, same shape as an achievement badge token. */
export const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function createShareToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
