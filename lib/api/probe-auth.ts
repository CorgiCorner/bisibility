import "server-only";

import { timingSafeEqual } from "node:crypto";
import {
  ApiAuthError,
  authenticateBearer,
  LEGACY_BEARER_PREFIXES,
  PERSONAL_TOKEN_PREFIX,
  PROJECT_API_KEY_PREFIX,
} from "./auth";

const MIN_PROBE_TOKEN_LENGTH = 32;

function bearerToken(req: Request) {
  const [scheme, token, extra] = req.headers.get("authorization")?.trim().split(/\s+/) ?? [];
  return scheme?.toLowerCase() === "bearer" && token && !extra ? token : null;
}

function matchesInternalProbeToken(candidate: string) {
  const configured = process.env.INTERNAL_PROBE_TOKEN?.trim() ?? "";
  const expected = Buffer.from(configured);
  const actual = Buffer.from(candidate);
  if (configured.length < MIN_PROBE_TOKEN_LENGTH || actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

function isApiCredential(candidate: string) {
  return (
    candidate.startsWith(PERSONAL_TOKEN_PREFIX) ||
    candidate.startsWith(PROJECT_API_KEY_PREFIX) ||
    LEGACY_BEARER_PREFIXES.some((prefix) => candidate.startsWith(prefix))
  );
}

export async function canReadDetailedHealth(req: Request, preauthenticated = false) {
  if (preauthenticated) return true;
  const candidate = bearerToken(req);
  if (!candidate) return false;
  if (matchesInternalProbeToken(candidate)) return true;
  if (!isApiCredential(candidate)) return false;

  try {
    await authenticateBearer(req);
    return true;
  } catch (error) {
    if (error instanceof ApiAuthError) return false;
    // Health must remain available when credential storage is part of the outage.
    return false;
  }
}
