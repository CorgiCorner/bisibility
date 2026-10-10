import type {
  MeasurementState,
  SourceConfiguration,
  TrackingEngine,
  TrackingSource,
} from "@/lib/ai-tracking/contract";
import { sourceConfigurationSchema } from "@/lib/ai-tracking/schema";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";

export interface TrackingPromptOperations {
  latestSample: {
    publicId: string;
    promptRevision: { publicId: string; text: string };
    source: TrackingSource;
    engine: TrackingEngine;
    measurement: MeasurementState;
    evidence: { observedAt?: string };
    createdAt: Date;
  } | null;
  upcomingScheduleCount: number;
  upcomingTruncated: boolean;
  earliestNextRunAt: Date | null;
  upcomingSchedules: {
    schedulePublicId: string;
    nextRunAt: Date | null;
    cron: string;
    timezone: string;
    configurations: SourceConfiguration[];
  }[];
}
interface OperationRow {
  promptId: string;
  sampleId: string | null;
  revisionId: string | null;
  text: string | null;
  source: TrackingSource | null;
  engine: TrackingEngine | null;
  measurement: MeasurementState | null;
  observedAt: string | null;
  createdAt: Date | null;
}
interface ScheduleRow {
  promptId: string;
  publicId: string;
  nextRunAt: Date | null;
  cron: string;
  timezone: string;
  configurations: unknown;
  count: bigint;
  earliestNextRunAt: Date | null;
}

export async function getTrackingPromptOperations(
  projectId: string,
  promptIds: string[],
): Promise<Record<string, TrackingPromptOperations>> {
  if (promptIds.length > 100) throw new Error("Prompt operations batch exceeds 100 prompts.");
  const ids = [...new Set(promptIds)];
  if (!ids.length) return {};
  const selected = Prisma.join(ids);
  const [samples, schedules] = await Promise.all([
    prisma.$queryRaw<OperationRow[]>(Prisma.sql`
      SELECT p.id AS "promptId", s."publicId" AS "sampleId", s."revisionId", s.text,
        s.source, s.engine, s.measurement, s."observedAt", s."createdAt"
      FROM ai_prompts p
      LEFT JOIN LATERAL (
        SELECT sample."publicId", revision."publicId" AS "revisionId", revision.text,
          sample.source, sample.engine, sample.measurement,
          sample.evidence->>'observedAt' AS "observedAt", sample."createdAt"
        FROM ai_prompt_revisions revision
        JOIN ai_tracking_samples sample ON sample."promptRevisionId" = revision.id
          AND sample."projectId" = p."projectId"
        WHERE revision."promptId" = p.id AND revision."projectId" = p."projectId"
        ORDER BY sample."createdAt" DESC, sample.id DESC LIMIT 1
      ) s ON true
      WHERE p."projectId" = ${projectId} AND p.id IN (${selected})`),
    prisma.$queryRaw<ScheduleRow[]>(Prisma.sql`
      SELECT p.id AS "promptId", s."publicId", s."nextRunAt", s.cron, s.timezone,
        s.configuration->'configurations' AS configurations, s.count, s."earliestNextRunAt"
      FROM ai_prompts p
      JOIN LATERAL (
        SELECT schedule.*, count(*) OVER () AS count,
          min(schedule."nextRunAt") OVER () AS "earliestNextRunAt"
        FROM ai_tracking_schedules schedule
        WHERE schedule."projectId" = p."projectId" AND schedule.enabled
          AND schedule."archivedAt" IS NULL
          AND schedule.configuration->'promptIds' @> jsonb_build_array(p.id)
        ORDER BY schedule."nextRunAt" ASC NULLS LAST, schedule.id ASC LIMIT 3
      ) s ON true
      WHERE p."projectId" = ${projectId} AND p.id IN (${selected})`),
  ]);
  const output: Record<string, TrackingPromptOperations> = {};
  for (const row of samples) {
    output[row.promptId] = {
      latestSample:
        row.sampleId &&
        row.revisionId &&
        row.text !== null &&
        row.source &&
        row.engine &&
        row.measurement &&
        row.createdAt
          ? {
              publicId: row.sampleId,
              promptRevision: { publicId: row.revisionId, text: row.text },
              source: row.source,
              engine: row.engine,
              measurement: row.measurement,
              evidence: row.observedAt ? { observedAt: row.observedAt } : {},
              createdAt: row.createdAt,
            }
          : null,
      upcomingSchedules: [],
      upcomingScheduleCount: 0,
      upcomingTruncated: false,
      earliestNextRunAt: null,
    };
  }
  for (const row of schedules) {
    const operation = output[row.promptId];
    if (operation) {
      operation.upcomingScheduleCount = Number(row.count);
      operation.upcomingTruncated = Number(row.count) > 3;
      operation.earliestNextRunAt = row.earliestNextRunAt;
    }
    output[row.promptId]?.upcomingSchedules.push({
      schedulePublicId: row.publicId,
      nextRunAt: row.nextRunAt,
      cron: row.cron,
      timezone: row.timezone,
      configurations: sourceConfigurationSchema.array().max(20).parse(row.configurations),
    });
  }
  return output;
}
