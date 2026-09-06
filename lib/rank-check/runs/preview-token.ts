import { createHmac, timingSafeEqual } from "node:crypto";
import { getPurposeSecretKeys } from "@/lib/providers/crypto";
import { type SerpDepth, serpDepthValues } from "@/lib/serp/markets";
import { z } from "zod";

const TOKEN_PURPOSE = "rank-check-run-preview";
const TOKEN_TTL_SECONDS = 10 * 60;
const tokenPayloadSchema = z
  .object({
    depth: z.union(serpDepthValues.map((depth) => z.literal(depth))).nullable(),
    estimateCents: z.number().finite(),
    exp: z.number().int().positive(),
    projectId: z.string().min(1),
    providerId: z.string().min(1).nullable(),
    selectionHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export type PreviewTokenExpected = {
  depth: SerpDepth | null;
  estimateCents: number;
  projectId: string;
  providerId: string | null;
  selectionHash: string;
};
export type PreviewTokenPayload = PreviewTokenExpected & { exp: number };
export type PreviewTokenErrorCode = "expired" | "mismatch" | "tampered";

export class PreviewTokenError extends Error {
  constructor(readonly code: PreviewTokenErrorCode) {
    super(`Rank-check preview token ${code}.`);
    this.name = "PreviewTokenError";
  }
}

function canonicalPayload(payload: PreviewTokenPayload) {
  return JSON.stringify({
    projectId: payload.projectId,
    selectionHash: payload.selectionHash,
    depth: payload.depth,
    providerId: payload.providerId,
    estimateCents: payload.estimateCents,
    exp: payload.exp,
  });
}

function signature(payload: Buffer, key: Buffer) {
  return createHmac("sha256", key).update(payload).digest();
}

export function createPreviewToken(expected: PreviewTokenExpected, now = new Date()) {
  const payload = tokenPayloadSchema.parse({
    ...expected,
    exp: Math.floor(now.getTime() / 1_000) + TOKEN_TTL_SECONDS,
  });
  const canonical = canonicalPayload(payload);
  const canonicalBytes = Buffer.from(canonical);
  const encodedPayload = canonicalBytes.toString("base64url");
  const primaryKey = getPurposeSecretKeys(TOKEN_PURPOSE)[0];
  if (!primaryKey) throw new Error("Rank-check preview signing key is unavailable.");
  const encodedSignature = signature(canonicalBytes, primaryKey).toString("base64url");
  return {
    expiresAt: new Date(payload.exp * 1_000),
    token: `${encodedPayload}.${encodedSignature}`,
  };
}

function verifiedSignature(encodedPayload: string, encodedSignature: string) {
  let payload: Buffer;
  let supplied: Buffer;
  try {
    payload = Buffer.from(encodedPayload, "base64url");
    supplied = Buffer.from(encodedSignature, "base64url");
  } catch {
    return false;
  }
  let verified = false;
  for (const key of getPurposeSecretKeys(TOKEN_PURPOSE)) {
    const expected = signature(payload, key);
    const matches = supplied.length === expected.length && timingSafeEqual(supplied, expected);
    verified = matches || verified;
  }
  return verified;
}

function decodePayload(encodedPayload: string): PreviewTokenPayload {
  try {
    return tokenPayloadSchema.parse(
      JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")),
    );
  } catch {
    throw new PreviewTokenError("tampered");
  }
}

export function verifyPreviewToken(
  token: string,
  expected: PreviewTokenExpected,
  now = new Date(),
): PreviewTokenPayload {
  const parts = token.split(".");
  const encodedPayload = parts[0];
  const encodedSignature = parts[1];
  if (parts.length !== 2 || !encodedPayload || !encodedSignature) {
    throw new PreviewTokenError("tampered");
  }
  if (!verifiedSignature(encodedPayload, encodedSignature)) {
    throw new PreviewTokenError("tampered");
  }
  const payload = decodePayload(encodedPayload);
  if (now.getTime() >= payload.exp * 1_000) throw new PreviewTokenError("expired");
  if (
    payload.projectId !== expected.projectId ||
    payload.selectionHash !== expected.selectionHash ||
    payload.depth !== expected.depth ||
    payload.providerId !== expected.providerId ||
    payload.estimateCents !== expected.estimateCents
  ) {
    throw new PreviewTokenError("mismatch");
  }
  return payload;
}
