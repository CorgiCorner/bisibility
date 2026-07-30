import { getOpsConfig } from "@/lib/ops/config";
import { notifyOps } from "@/lib/ops/notify";

export async function notifyPresenceBudgetExhausted(input: {
  deferred: number;
  projectIds: string[];
  property: string;
  propertyAccountKey: string;
}) {
  const includeNames = getOpsConfig().includeNames;
  await notifyOps({
    fields: {
      "Affected project count": input.projectIds.length,
      "Affected projects": input.projectIds.join(", "),
      "Deferred URLs": input.deferred,
      "Property identifier": input.propertyAccountKey,
      ...(includeNames ? { Property: input.property } : {}),
    },
    kind: "presence_inspection_budget",
    severity: "warning",
    title: includeNames
      ? `URL inspection budget exhausted for ${input.property}`
      : "URL inspection budget exhausted",
  });
}
