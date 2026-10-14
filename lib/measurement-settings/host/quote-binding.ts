import "server-only";
import {
  createPreviewToken,
  PreviewTokenError,
  verifyPreviewToken,
} from "@/lib/rank-check/runs/preview-token";
import type { SerpDepth } from "@/lib/serp/constants";
import { settingsActorScope, settingsHash } from "./hash";

type Purpose = "manual" | "schedule" | "intent" | "defaults";
export type SettingsQuoteBinding = Readonly<{
  projectId: string;
  /** Trusted authenticated host actor; never accepted from the quote/request body. */
  actorId: string;
  depth: SerpDepth;
  providerId: string | null;
  source: unknown;
  selection: unknown;
}>;
function expected(purpose: Purpose, binding: SettingsQuoteBinding) {
  if (typeof binding.actorId !== "string" || !binding.actorId.trim())
    throw new PreviewTokenError("tampered");
  return {
    projectId: binding.projectId,
    depth: binding.depth,
    providerId: binding.providerId,
    trigger: "manual" as const,
    estimateCents: -1,
    selectionHash: settingsHash(`selection:${purpose}`, binding.selection),
    // Version boundary deliberately refuses any uncommitted issuerless quote.
    sourceHash: settingsHash(`quote:${purpose}:issued-actor-v2`, {
      actorScopeHash: settingsActorScope(binding.projectId, binding.actorId),
      source: binding.source,
    }),
  };
}
export function signSettingsQuote(purpose: Purpose, binding: SettingsQuoteBinding, asOf: Date) {
  const signed = createPreviewToken(expected(purpose, binding), asOf);
  return { token: signed.token, expiresAt: signed.expiresAt.toISOString() };
}
export function verifySettingsQuote(
  purpose: Purpose,
  token: string,
  binding: SettingsQuoteBinding,
  now: Date,
) {
  return verifyPreviewToken(token, expected(purpose, binding), now);
}
/** Only an untrusted bounded forecast clock candidate. Authority comes from MAC verification after recomputation. */
export function settingsQuoteClock(token: string, now: Date) {
  try {
    if (token.length > 8192 || token.split(".").length !== 2) throw new Error();
    const value: unknown = JSON.parse(
      Buffer.from(token.split(".")[0], "base64url").toString("utf8"),
    );
    if (
      !value ||
      typeof value !== "object" ||
      !("exp" in value) ||
      typeof value.exp !== "number" ||
      !Number.isSafeInteger(value.exp)
    )
      throw new Error();
    const start = (value.exp - 600) * 1000;
    if (
      !Number.isSafeInteger(start) ||
      start > now.getTime() + 1000 ||
      start < now.getTime() - 600_000
    )
      throw new Error();
    return new Date(start);
  } catch {
    throw new PreviewTokenError("tampered");
  }
}
