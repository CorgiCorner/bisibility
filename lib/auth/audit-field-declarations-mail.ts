import { type AuditPayloadPolicy, auditFields as f } from "@/lib/auth/audit-payload-policy";

type Declare = (actions: readonly string[], policy?: AuditPayloadPolicy) => void;

export function registerMailAuditDeclarations(declare: Declare) {
  const strings = (...names: string[]) => f.strings(...names);
  declare(["instance_admin.mail_settings.clear"], {
    after: strings("result"),
    before: strings("provider"),
  });
  declare(["instance_admin.mail_settings.save"], {
    after: {
      ...f.booleans("credentialsReplaced", "senderChanged"),
      ...strings("provider"),
    },
  });
}
