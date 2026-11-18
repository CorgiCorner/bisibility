import { type AuditPayloadPolicy, auditFields as f } from "@/lib/auth/audit-payload-policy";

type Declare = (actions: readonly string[], policy?: AuditPayloadPolicy) => void;

/** Assistant audit rows carry identity metadata only; prompts, arguments and keys never enter them. */
export function registerAssistantAuditDeclarations(declare: Declare) {
  declare([
    "assistant.credential.saved",
    "assistant.credential.removed",
    "assistant.tool.approved",
    "assistant.tool.denied",
    "assistant.tool.executed",
  ]);
  declare(["assistant.funding.updated"], {
    before: f.strings("mode", "provider"),
    after: f.strings("mode", "provider"),
  });
}
