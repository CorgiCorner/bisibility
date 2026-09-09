import { type AuditPayloadPolicy, auditFields as f } from "./audit-payload-policy";

export function registerOnboardingAuditDeclarations(
  declare: (actions: readonly string[], policy: AuditPayloadPolicy) => void,
) {
  const website = {
    ...f.strings("domain", "name"),
    ...f.booleans("gscConnected"),
    ...f.numbers("rewrittenKeywords"),
  };
  declare(["onboarding.project_website.update"], { before: website, after: website });
}
