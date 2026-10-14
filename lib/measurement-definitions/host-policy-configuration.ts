import "server-only";
import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { RANK_REPORT_CALENDAR_CONFIGURATION } from "@/lib/rank-reports/host-policy";
import { z } from "zod";
import { hostDefinitionAdapters } from "./host-adapters";
import { recordHostDefinitionMutation } from "./host-audit";
import type { DefinitionActorContext, DefinitionDatabase } from "./model";
import { configureDefinitionPolicy } from "./policy-config";

const duration = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable();
export const configureHostPolicySchema = z
  .object({
    projectId: z.string().refine((value) => isPublicIdOfType(value, "prj")),
    expectedPolicyEpoch: z
      .string()
      .regex(/^(?:0|[1-9]\d*)$/u)
      .refine((value) => BigInt(value) <= 9_223_372_036_854_775_807n),
    manualTtlMs: duration,
    cadenceGraceMs: duration,
    confirmed: z.literal(true),
  })
  .strict();
/** Explicit semantic intent. It neither launches work nor accepts a quote under a stale policy. */
export function configureHostDefinitionPolicy(
  db: DefinitionDatabase,
  context: DefinitionActorContext,
  input: unknown,
) {
  const data = configureHostPolicySchema.parse(input);
  return configureDefinitionPolicy(
    db,
    context,
    {
      projectId: data.projectId,
      expectedPolicyEpoch: data.expectedPolicyEpoch,
      config: {
        version: 1,
        definitionVersion: "web-organic-v1",
        forcedAiOverview: false,
        adapters: hostDefinitionAdapters(),
        freshness: {
          configurationRevision: RANK_REPORT_CALENDAR_CONFIGURATION,
          manualTtlMs: data.manualTtlMs,
          cadenceGraceMs: data.cadenceGraceMs,
        },
      },
    },
    recordHostDefinitionMutation,
  );
}
