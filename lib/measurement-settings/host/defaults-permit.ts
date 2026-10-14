import "server-only";
import { DefaultsReviewRequiredError } from "@/lib/settings/reviewed-defaults-contract";
import type { SettingsQuoteBinding } from "./quote-binding";
import { type ReviewedConsentSummary, verifiedReviewedConsent } from "./reviewed-consent";

export type ReviewedDefaultsPermit = Readonly<{ readonly projectId: string }>;
export type DefaultsWritePrincipal = Readonly<{ kind: "user" | "project_key"; id: string }>;
const permits = new WeakMap<
  ReviewedDefaultsPermit,
  Readonly<{ principal: DefaultsWritePrincipal; consent: ReviewedConsentSummary }>
>();
/** Only a successfully verified server quote mints this in-process, one-use write permit. */
export function verifyDefaultsWritePermit(
  purpose: "intent" | "defaults",
  token: string,
  binding: SettingsQuoteBinding,
  now: Date,
  principal: DefaultsWritePrincipal = { kind: "user", id: binding.actorId },
): ReviewedDefaultsPermit {
  if (principal.id !== binding.actorId || (purpose === "intent" && principal.kind !== "user"))
    throw new DefaultsReviewRequiredError();
  const consent = verifiedReviewedConsent(purpose, token, binding, now, principal.kind);
  const permit = Object.freeze({ projectId: binding.projectId });
  permits.set(permit, Object.freeze({ principal: Object.freeze({ ...principal }), consent }));
  return permit;
}
export function consumeReviewedDefaultsAuthority(
  permit: ReviewedDefaultsPermit,
  projectId: string,
  actorId: string,
) {
  const authority = permit && permits.get(permit);
  const principal = authority?.principal;
  if (!authority || !principal || permit.projectId !== projectId || principal.id !== actorId)
    throw new DefaultsReviewRequiredError();
  permits.delete(permit);
  return authority;
}

/** Preserve the established principal-only consumer; either consumer spends the same permit. */
export function consumeDefaultsWritePermit(
  permit: ReviewedDefaultsPermit,
  projectId: string,
  actorId: string,
) {
  return consumeReviewedDefaultsAuthority(permit, projectId, actorId).principal;
}
