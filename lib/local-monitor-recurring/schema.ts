import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { monitorLaunchSchema, monitorPreviewSchema } from "@/lib/local-monitor-launch/contracts";
import { z } from "zod";
import { exactCents } from "./cost";

const amount = z
  .string()
  .max(60)
  .regex(/^(?:0|[1-9]\d{0,39})(?:\.\d{1,18})?$/u);
const iso = z
  .string()
  .max(32)
  .refine((v) => {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) && d.toISOString() === v;
  });
export const calendarSchema = z
  .object({
    scheduleId: z.string(),
    publicId: z.string().refine((v) => isPublicIdOfType(v, "sch")),
    measurementEpoch: z.string().regex(/^(0|[1-9]\d*)$/u),
    frequency: z.enum(["daily", "weekly", "monthly", "custom_cron"]),
    cronExpression: z.string().nullable(),
    timeOfDay: z.string().nullable(),
    timezone: z.string(),
    jitterMinutes: z.number().int().nonnegative(),
    serpDepth: z.number().nullable(),
    providerPolicy: z.string().nullable(),
  })
  .strict();
const recurringFields = {
  scheduleId: z.string().refine((v) => isPublicIdOfType(v, "sch")),
  expectedScheduleEpoch: z.string().regex(/^(0|[1-9]\d*)$/u),
  maximumPerOccurrenceCents: amount,
  maximumTotalCents: amount,
  maximumOccurrences: z.number().int().positive().max(10000),
  validUntil: iso,
  catchUp: z.literal("skip_elapsed"),
};
function limits(
  value: { maximumPerOccurrenceCents: string; maximumTotalCents: string },
  ctx: z.RefinementCtx,
) {
  if (
    exactCents(value.maximumPerOccurrenceCents) <= 0n ||
    exactCents(value.maximumTotalCents) < exactCents(value.maximumPerOccurrenceCents)
  )
    ctx.addIssue({ code: "custom", message: "Total ceiling must cover one positive occurrence." });
}
export const recurringPreviewSchema = monitorPreviewSchema
  .extend(recurringFields)
  .superRefine(limits);
const approvalBase = monitorLaunchSchema.extend({ ...recurringFields, calendar: calendarSchema });
export const recurringApprovalSchema = approvalBase.superRefine(limits);
export type RecurringPreviewCommand = z.infer<typeof recurringPreviewSchema>;
export type RecurringApprovalCommand = z.infer<typeof recurringApprovalSchema>;
export const approvalSnapshotSchema = approvalBase
  .omit({ consentToken: true })
  .extend({
    actorId: z.string(),
    internalProjectId: z.string(),
    connectionStamp: z.string().regex(/^[a-f0-9]{64}$/u),
    definitionHash: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .superRefine(limits);
export type RecurringApprovalSnapshot = z.infer<typeof approvalSnapshotSchema>;
