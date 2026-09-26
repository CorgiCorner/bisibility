import "server-only";

import type { AuditPayloadPolicy } from "@/lib/auth/audit-payload-policy";

export function auditPayloadPolicyExtension(_action: string): AuditPayloadPolicy | null {
  return null;
}
