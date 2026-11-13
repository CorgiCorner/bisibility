import { chartMarkerGeneratedTitles, chartMarkerKinds } from "@/lib/annotations/marker-style";
import { z } from "zod";
import {
  MAX_BODY_BYTES,
  MAX_CHALLENGE_DAYS,
  MAX_LESSON_CHARS,
  MAX_MARKERS,
  MAX_SERIES_POINTS,
  MAX_TOP_PAGES,
} from "./period";
import { CHALLENGE_TILE_IDS } from "./tile-state";

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const reason = z.string().trim().min(1).max(64);
const count = z.number().int().nonnegative();

const unavailable = z
  .object({
    reason,
    state: z.enum(["no_data", "not_connected"]),
  })
  .strict();

function available<T extends z.ZodRawShape>(shape: T) {
  return z.discriminatedUnion("state", [
    unavailable,
    z.object({ state: z.literal("ok"), ...shape }).strict(),
  ]);
}

const clickPoint = z
  .object({
    clicks: count.nullable(),
    date: dateKey,
  })
  .strict();

const marker = z
  .object({
    added: count.optional(),
    dateKey,
    endDateKey: dateKey.optional(),
    generated: z.enum(chartMarkerGeneratedTitles).optional(),
    id: z.string().trim().min(1).max(80),
    kind: z.enum(chartMarkerKinds),
    removed: count.optional(),
    title: z.string().max(160),
  })
  .strict();

const moneyLine = z
  .object({
    currency: z.string().regex(/^[A-Z]{3}$/),
    minor: count,
  })
  .strict();

export const MAX_LESSON_QUESTION_CHARS = 240;

export const challengeLessonsSchema = z.union([
  z
    .object({
      entries: z.array(
        z
          .object({
            question: z.string().trim().min(1).max(MAX_LESSON_QUESTION_CHARS),
            answer: z.string().max(MAX_LESSON_CHARS),
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({
      dropped: z.string().max(MAX_LESSON_CHARS),
      unknown: z.string().max(MAX_LESSON_CHARS),
      worked: z.string().max(MAX_LESSON_CHARS),
    })
    .strict(),
]);

export const emptyChallengeLessons: ChallengeLessons = { entries: [] };

export function lessonEntries(
  lessons: ChallengeLessons,
  label: (key: "worked" | "dropped" | "unknown") => string,
) {
  if ("entries" in lessons) return lessons.entries;
  return (["worked", "dropped", "unknown"] as const)
    .filter((key) => lessons[key].trim())
    .map((key) => ({ answer: lessons[key], question: label(key) }));
}

const clicksTile = available({
  current: count,
  bucketDays: z.number().int().min(2).optional(),
  currentSeries: z.array(clickPoint).max(MAX_SERIES_POINTS),
  markers: z.array(marker).max(MAX_MARKERS),
  percentChange: z.number().int().nullable(),
  previous: count,
  previousSeries: z.array(clickPoint).max(MAX_SERIES_POINTS),
});

const activeDaysTile = available({
  activeCount: count,
  days: z.array(z.object({ active: z.boolean(), date: dateKey }).strict()).max(MAX_CHALLENGE_DAYS),
  scope: z.enum(["user", "project"]),
  skipped: z.array(dateKey).max(MAX_CHALLENGE_DAYS),
});

const engineCount = z
  .object({
    day1Named: count,
    day1Total: count,
    engine: z.string().trim().min(1).max(32),
    named: count,
    total: count,
  })
  .strict();

const aiAnswersTile = available({
  day1Named: count,
  day1Total: count,
  engines: z.array(engineCount).max(8),
  named: count,
  total: count,
});

const existingVsNewTile = available({
  existingClicks: count,
  existingPages: count,
  newClicks: count,
  newPages: count,
});

const top10Tile = available({
  bestJump: z
    .object({
      from: z.number().int().positive(),
      keyword: z.string().trim().min(1).max(120),
      to: z.number().int().positive(),
    })
    .strict()
    .nullable(),
  endCount: count,
  hasStart: z.boolean().optional(),
  startCount: count,
});

const conversionsTile = available({
  current: count,
  goals: z.array(z.string().trim().min(1).max(120)).max(20),
  previous: count,
});

const topPagesTile = available({
  pages: z
    .array(
      z
        .object({
          clicks: count,
          path: z.string().trim().min(1).max(200),
        })
        .strict(),
    )
    .max(MAX_TOP_PAGES),
});

const costTile = available({
  aiAnswersMinor: count,
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
  other: z.array(moneyLine).max(8),
  perDayMinor: count.nullable(),
  rankChecksMinor: count,
  subscriptions: z.array(moneyLine).max(8),
  totalMinor: count.nullable(),
});

export const challengeReportBodySchema = z
  .object({
    generatedAt: z.iso.datetime(),
    lessons: challengeLessonsSchema,
    journey: z
      .object({ workDays: count, calendarDays: count, checkIns: count.optional() })
      .strict()
      .optional(),
    period: z
      .object({
        days: z.number().int().min(1).max(MAX_CHALLENGE_DAYS),
        from: dateKey,
        to: dateKey,
      })
      .strict(),
    sources: z
      .array(
        z.enum([
          "ai_visibility",
          "conversions",
          "pages",
          "practice_days",
          "rank_tracker",
          "search_console",
          "usage",
        ]),
      )
      .max(8),
    stage: z.enum(["custom", "day30", "day60", "day90"]),
    tiles: z
      .object({
        activeDays: activeDaysTile,
        aiAnswers: aiAnswersTile,
        clicks: clicksTile,
        conversions: conversionsTile,
        cost: costTile,
        existingVsNew: existingVsNewTile,
        top10: top10Tile,
        topPages: topPagesTile,
      })
      .strict(),
    version: z.literal(1),
    workScope: z.enum(["project", "hidden"]).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_BODY_BYTES) {
      ctx.addIssue({ code: "custom", message: "Challenge report body is too large." });
    }
    if (!CHALLENGE_TILE_IDS.every((id) => id in value.tiles)) {
      ctx.addIssue({ code: "custom", message: "Challenge report is missing a tile." });
    }
  });

export type ChallengeReportBody = z.infer<typeof challengeReportBodySchema>;
export type ChallengeLessons = z.infer<typeof challengeLessonsSchema>;
export type ChallengeTile = ChallengeReportBody["tiles"][keyof ChallengeReportBody["tiles"]];
export type ChallengeClicksTile = ChallengeReportBody["tiles"]["clicks"];
export type ChallengeActiveDaysTile = ChallengeReportBody["tiles"]["activeDays"];
export type ChallengeAiTile = ChallengeReportBody["tiles"]["aiAnswers"];
export type ChallengeExistingTile = ChallengeReportBody["tiles"]["existingVsNew"];
export type ChallengeTop10Tile = ChallengeReportBody["tiles"]["top10"];
export type ChallengeConversionsTile = ChallengeReportBody["tiles"]["conversions"];
export type ChallengeTopPagesTile = ChallengeReportBody["tiles"]["topPages"];
export type ChallengeCostTile = ChallengeReportBody["tiles"]["cost"];

export function parseChallengeReportBody(value: unknown) {
  return challengeReportBodySchema.safeParse(value);
}

export function challengeReportBodyBytes(body: ChallengeReportBody) {
  return new TextEncoder().encode(JSON.stringify(body)).byteLength;
}
