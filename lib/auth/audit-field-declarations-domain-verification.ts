import { type AuditPayloadPolicy, auditFields as f } from "./audit-payload-policy";

export function registerDomainVerificationAuditDeclarations(
  declare: (actions: readonly string[], policy: AuditPayloadPolicy) => void,
) {
  const verification = {
    ...f.strings("domain", "method", "proofScope"),
    ...f.dates("verifiedAt", "revokedAt"),
    ...f.numbers("failures"),
  };
  declare(["project.domain_verification.grant", "project.domain_verification.revoke"], {
    before: verification,
    after: { ...verification, ...f.strings("source", "apiKeyId") },
  });
}
