import { scheduleReviewSchema } from "@/lib/schemas/schedule-review";
import { z } from "zod";
import { closedEnum, publicIdUnion, sdkName } from "./openapi-sdk-schema";
import { scheduleKinds, scheduleStates } from "./schedules-input";

export const rankScheduleId = z.string().regex(/^sch_[a-z][a-z0-9]{23}$/);
export const keywordScheduleId = rankScheduleId.nullable();
const scheduleId = z
  .union([
    rankScheduleId,
    z.string().regex(/^ais_[a-z][a-z0-9]{23}$/),
    z.string().regex(/^lmn_[a-z][a-z0-9]{23}$/),
    z.string().regex(/^dsy_[a-z][a-z0-9]{23}$/),
  ])
  .meta({
    ...sdkName("ScheduleChangeTargetId"),
    ...publicIdUnion(["rank", "ai", "localMonitor", "dataSync"]),
  });
const review = scheduleReviewSchema.meta(sdkName("ScheduleReviewSubmission")).optional();
const keywordIds = z
  .array(z.string().regex(/^kw_[a-z][a-z0-9]{23}$/))
  .min(1)
  .max(500);

const cadence = z
  .strictObject({
    frequency: z
      .enum(["paused", "manual", "daily", "weekly", "monthly", "custom_cron"])
      .meta(closedEnum("ScheduleWriteFrequency"))
      .optional(),
    cron_expression: z.string().nullable().optional(),
    time_of_day: z.string().nullable().optional(),
    timezone: z.string().nullable().optional(),
    jitter_minutes: z.number().int().min(0).max(120).optional(),
  })
  .meta(sdkName("RankScheduleCadencePatch"));

const settings = z
  .strictObject({
    provider_policy: z.string().nullable().optional(),
    serp_depth: z
      .literal([10, 20, 50, 100])
      .meta(closedEnum("ScheduleWriteSerpDepth"))
      .nullable()
      .optional(),
  })
  .meta(sdkName("RankScheduleSettingsPatch"));

const ai = z.strictObject({
  name: z.string().trim().min(1).max(200),
  cron: z.string().min(1).max(200),
  timezone: z.string().min(1).max(100),
  enabled: z.boolean().optional(),
  configuration: z.record(z.string(), z.unknown()),
  consent: z.boolean().optional(),
  next_run_at: z.iso.datetime().nullable().optional(),
});

const rank = z.strictObject({
  name: z.string().trim().min(1).max(80),
  cadence: cadence
    .extend({ frequency: cadence.shape.frequency.unwrap() })
    .meta(sdkName("RankScheduleCadenceInput")),
  settings: settings.optional(),
});

export const scheduleCreateBody = z.discriminatedUnion("kind", [
  rank.extend({ kind: z.literal("rank"), review }).meta(sdkName("CreateRankSchedule")),
  ai.extend({ kind: z.literal("ai"), review }).meta(sdkName("CreateAiSchedule")),
]);

export const scheduleUpdateBody = z.union([
  z
    .strictObject({
      state: z.enum(scheduleStates).meta(closedEnum("ScheduleWriteState")),
      review,
    })
    .meta(sdkName("ChangeScheduleState")),
  rank
    .partial()
    .extend({
      kind: z.literal("rank"),
      cadence: cadence.optional(),
      state: z.enum(["active", "paused"]).meta(closedEnum("ScheduleEnabledState")).optional(),
      target: z
        .strictObject({ keyword_ids: keywordIds })
        .meta(sdkName("RankScheduleMembershipInput"))
        .optional(),
      review,
    })
    .refine(
      ({ target, cadence, settings, name, state }) =>
        !target || (!cadence && !settings && name === undefined && state === undefined),
      "Set rank membership separately from schedule properties.",
    )
    .meta(sdkName("UpdateRankSchedule")),
  ai
    .partial()
    .extend({
      kind: z.literal("ai"),
      state: z.enum(["active", "paused"]).meta(closedEnum("ScheduleEnabledState")).optional(),
      review,
    })
    .meta(sdkName("UpdateAiSchedule")),
]);

export const publicSchedulePreviewBody = z.discriminatedUnion("operation", [
  z
    .strictObject({
      operation: z.literal("create"),
      schedule: scheduleCreateBody.meta({
        ...sdkName("PreviewCreateScheduleInput"),
        "x-bisibility-union": { style: "tagged", tag: "kind", cases: ["rank", "ai"] },
      }),
    })
    .meta(sdkName("PreviewScheduleCreate")),
  z
    .strictObject({
      operation: z.literal("update"),
      schedule_id: scheduleId,
      schedule: scheduleUpdateBody.meta({
        ...sdkName("PreviewUpdateScheduleInput"),
        "x-bisibility-union": { style: "tagged", tag: "kind", cases: ["state", "rank", "ai"] },
      }),
    })
    .meta(sdkName("PreviewScheduleUpdate")),
  z
    .strictObject({
      operation: z.literal("set_schedule"),
      keyword_ids: keywordIds,
      schedule_id: keywordScheduleId,
    })
    .meta(sdkName("PreviewKeywordScheduleAssignment")),
  z
    .strictObject({
      operation: z.literal("set_frequency"),
      keyword_ids: keywordIds,
      frequency: cadence.shape.frequency,
      schedule: z.record(z.string(), z.unknown()).optional(),
    })
    .meta(sdkName("PreviewLegacyKeywordCadence")),
  z
    .strictObject({
      operation: z.literal("create_keywords"),
      keywords: z.unknown(),
    })
    .meta(sdkName("PreviewKeywordCreate")),
]);

export function isUnsupportedScheduleCreate(value: unknown) {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    scheduleKinds.some((kind) => kind !== "rank" && kind !== "ai" && kind === value.kind)
  );
}
