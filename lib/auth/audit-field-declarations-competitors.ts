import {
  type AuditFieldPolicy,
  type AuditPayloadPolicy,
  auditFields as f,
} from "@/lib/auth/audit-payload-policy";

type Declare = (actions: readonly string[], policy?: AuditPayloadPolicy) => void;

/** Competitor entity payloads. Kept beside the main registry only to hold it under its line budget. */
export function registerCompetitorAuditDeclarations(declare: Declare) {
  const list = (policy: AuditFieldPolicy): readonly [AuditFieldPolicy] => [policy];
  const strings = (...names: string[]) => f.strings(...names);
  const competitor = {
    aliases: list("string"),
    evidence: { ...strings("domain"), ...f.numbers("bestPosition", "of", "seenOn") },
    ...strings("domain", "id", "label", "scopePolicy", "source"),
  };
  declare(["competitor.add"], { after: competitor });
  declare(["competitor.remove"], { before: competitor });
  declare(["competitor.rename"], { after: competitor, before: competitor });
  declare(["competitor.suggestion.confirm", "competitor.manual.add"], { after: competitor });
  declare(["competitor.aliases.update", "competitor.details.update"], {
    after: competitor,
    before: competitor,
  });
  declare(["competitor.suggestion.dismiss"], { after: strings("domain") });
  declare(["competitor.setup.confirm", "competitor.setup.skip"], { after: strings("outcome") });
  declare(["competitor.market_membership.replace"], {
    after: { marketIds: list("string"), ...strings("scopePolicy") },
    before: strings("scopePolicy"),
  });
}
