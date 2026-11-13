import { type AuditPayloadPolicy, auditFields as f } from "./audit-payload-policy";

export function registerConversionAuditDeclarations(
  declare: (actions: readonly string[], policy?: AuditPayloadPolicy) => void,
) {
  const strings = (...names: string[]) => f.strings(...names);
  const primarySource = strings("primaryConversionSource");
  const conversionGoal = {
    ...strings("displayName", "source", "sourceName"),
    ...f.booleans("countsRevenue", "enabled"),
  };
  declare(["conversion.primary.update"], { after: primarySource, before: primarySource });
  declare(["conversion.goal.update"], { after: conversionGoal, before: conversionGoal });
  declare(["conversion.sync_now"], { after: strings("source") });
}
