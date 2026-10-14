import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { localToken, projectRef } from "@/lib/local-monitoring-store/target-input-schema";
import { z } from "zod";
import { definitionAuthoringSchema } from "./definition-schema";

export {
  definitionAuthoringSchema,
  definitionInputSchema,
  type MonitorDefinitionInput,
  monitorAxesSchema,
} from "./definition-schema";

export const monitorRef = z.string().refine((value) => isPublicIdOfType(value, "lmn"));
const version = z.int().min(0).max(2_147_483_646);
const common = { projectId: projectRef, idempotencyKey: localToken };
export const createMonitorSchema = z
  .object({ ...common, definition: definitionAuthoringSchema })
  .strict();
export const reviseMonitorSchema = z
  .object({
    ...common,
    monitorId: monitorRef,
    expectedVersion: version,
    definition: definitionAuthoringSchema,
  })
  .strict();
export const archiveMonitorSchema = z
  .object({ ...common, monitorId: monitorRef, expectedVersion: version })
  .strict();
export const scheduleIntentSchema = z
  .object({
    ...common,
    monitorId: monitorRef,
    expectedVersion: version,
    mode: z.enum(["manual", "paused", "scheduled"]),
    scheduleId: z
      .string()
      .refine((value) => isPublicIdOfType(value, "sch"))
      .nullable(),
    expectedScheduleEpoch: z
      .string()
      .regex(/^(0|[1-9]\d*)$/)
      .nullable(),
    consentToken: localToken.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.mode === "scheduled"
        ? !value.scheduleId || value.expectedScheduleEpoch === null || !value.consentToken
        : value.scheduleId !== null ||
          value.expectedScheduleEpoch !== null ||
          value.consentToken !== null
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Scheduled intent requires an explicit calendar epoch and consent.",
      });
    }
  });
export const readMonitorSchema = z
  .object({ projectId: projectRef, monitorId: monitorRef })
  .strict();
