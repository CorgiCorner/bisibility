import {
  type AuditFieldPolicy,
  type AuditPayloadPolicy,
  auditFields as f,
} from "@/lib/auth/audit-payload-policy";

type Declare = (actions: readonly string[], policy?: AuditPayloadPolicy) => void;
const strings = (...names: string[]) => f.strings(...names);

export function registerAccountAuditDeclarations(
  declare: Declare,
  { projectCounts }: { projectCounts: AuditFieldPolicy },
) {
  declare(["account.profile_updated"], {
    after: strings("name"),
    before: strings("name"),
  });
  declare(["account.avatar_updated"], {
    after: f.urls("image"),
    before: f.urls("image"),
  });
  declare(["account.email_change_code_requested", "account.email_verification_requested"], {
    after: strings("email"),
  });
  declare(["account.email_change_requested"], {
    after: strings("email"),
    before: strings("email"),
  });
  declare(["account.email_changed"], {
    after: { ...strings("email"), ...f.numbers("revokedSessionCount") },
    before: strings("email"),
  });
  declare(["account.email_verified"], {
    after: { ...strings("email"), ...f.booleans("emailVerified") },
    before: { ...strings("email"), ...f.booleans("emailVerified") },
  });
  declare(["account.deleted"], {
    before: { ...strings("email", "name"), counts: projectCounts },
  });
  declare(["account.session_revoked"], { before: strings("id", "ipAddress", "userAgent") });
  declare(["account.sessions_revoked"], { after: f.numbers("revokedCount") });
  declare(["user.date_format.update"], {
    after: strings("dateFormat"),
    before: strings("dateFormat"),
  });
}
