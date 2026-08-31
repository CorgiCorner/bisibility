import { createHmac, timingSafeEqual } from "node:crypto";
import { resolveAuthSecret } from "@/lib/auth/secret";
import { isPublicIdOfType } from "@/lib/db/public-id";

export const SETUP_ACKNOWLEDGEMENT_COOKIE = "getting-started-ack";
export const SETUP_ACKNOWLEDGEMENT_MAX_AGE = 60 * 60 * 24 * 365;
const MAX_ACKNOWLEDGEMENTS = 40;

export type SetupAcknowledgement = Readonly<{ projectRef: string; userId: string }>;

function signature(payload: string): string {
  return createHmac("sha256", resolveAuthSecret()).update(payload).digest("base64url");
}

function verifiedPayload(raw: string): string | null {
  const separator = raw.lastIndexOf(".");
  if (separator < 1) return null;
  const payload = raw.slice(0, separator);
  const supplied = Buffer.from(raw.slice(separator + 1));
  const expected = Buffer.from(signature(payload));
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
    ? payload
    : null;
}

export function parseSetupAcknowledgements(raw: string | undefined): SetupAcknowledgement[] {
  if (!raw) return [];
  try {
    const payload = verifiedPayload(raw);
    if (!payload) return [];
    const value: unknown = JSON.parse(decodeURIComponent(payload));
    if (!Array.isArray(value)) return [];
    return value
      .flatMap((entry) => {
        if (
          typeof entry === "object" &&
          entry !== null &&
          "projectRef" in entry &&
          "userId" in entry &&
          typeof entry.projectRef === "string" &&
          typeof entry.userId === "string" &&
          entry.userId.length <= 128 &&
          isPublicIdOfType(entry.projectRef, "prj")
        ) {
          return [{ projectRef: entry.projectRef, userId: entry.userId }];
        }
        return [];
      })
      .slice(-MAX_ACKNOWLEDGEMENTS);
  } catch {
    return [];
  }
}

export function addSetupAcknowledgement(
  entries: readonly SetupAcknowledgement[],
  userId: string,
  projectRef: string,
): SetupAcknowledgement[] {
  const retained = entries.filter(
    (entry) => entry.userId !== userId || entry.projectRef !== projectRef,
  );
  return [...retained, { projectRef, userId }].slice(-MAX_ACKNOWLEDGEMENTS);
}

export function serializeSetupAcknowledgements(entries: readonly SetupAcknowledgement[]): string {
  const bounded = entries.slice(-MAX_ACKNOWLEDGEMENTS);
  while (bounded.length > 0) {
    const payload = encodeURIComponent(JSON.stringify(bounded));
    const serialized = `${payload}.${signature(payload)}`;
    if (serialized.length <= 3500) return serialized;
    bounded.shift();
  }
  const payload = encodeURIComponent("[]");
  return `${payload}.${signature(payload)}`;
}

export function isSetupAcknowledged(
  raw: string | undefined,
  userId: string,
  projectRef: string,
): boolean {
  return parseSetupAcknowledgements(raw).some(
    (entry) => entry.userId === userId && entry.projectRef === projectRef,
  );
}
