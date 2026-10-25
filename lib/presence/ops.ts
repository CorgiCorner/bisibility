import { getOpsConfig } from "@/lib/ops/config";
import { notifyOps } from "@/lib/ops/notify";

export async function notifyPresenceBudgetExhausted(input: {
  deferred: number;
  projectIds: string[];
  property: string;
  propertyAccountKey: string;
  resetAt?: Date | null;
}) {
  const includeNames = getOpsConfig().includeNames;
  await notifyOps({
    fields: {
      "Affected project count": input.projectIds.length,
      "Affected projects": input.projectIds.join(", "),
      "Deferred URLs": input.deferred,
      "Property identifier": input.propertyAccountKey,
      ...(input.resetAt ? { "Quota reset at": input.resetAt.toISOString() } : {}),
      ...(includeNames ? { Property: input.property } : {}),
    },
    kind: "presence_inspection_budget",
    severity: "warning",
    title: includeNames
      ? `URL inspection budget exhausted for ${input.property}`
      : "URL inspection budget exhausted",
  });
}
