import type {
  KeywordScheduleMembership,
  keywordMembershipSchedule,
} from "@/lib/keywords/schedule-membership";
import { scheduleState } from "@/lib/schedules/types";
import { requireApiPublicId } from "./public-id";

export function keywordScheduleResource(
  schedule: ReturnType<typeof keywordMembershipSchedule> | null,
  membership: KeywordScheduleMembership | null | undefined,
  lastCheckedAt: Date | null | undefined,
) {
  return schedule
    ? {
        cron_expression: schedule.cronExpression,
        frequency: schedule.frequency,
        jitter_minutes: schedule.jitterMinutes,
        last_checked_at: lastCheckedAt?.toISOString() ?? null,
        next_check_at: schedule.nextCheckAt?.toISOString() ?? null,
        schedule_id: membership ? requireApiPublicId(membership.publicId, "sch") : null,
        schedule_state: membership
          ? scheduleState(
              Boolean(membership.enabled) &&
                !["manual", "paused"].includes(membership.frequency ?? "manual"),
              membership.archivedAt,
            )
          : null,
        source: "keyword",
        timezone: schedule.timezone,
      }
    : null;
}
