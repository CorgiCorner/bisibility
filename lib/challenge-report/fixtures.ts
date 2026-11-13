import type { ChartMarker } from "@/lib/annotations/marker-style";
import { assembleChallengeReport } from "./assemble";
import { eachDate } from "./period";
import type { ChallengeReportBody } from "./schema";
import { challengeReportBodySchema } from "./schema";
import { unavailableTile } from "./tile-state";
import {
  buildActiveDaysTile,
  buildAiAnswersTile,
  buildConversionsTile,
  buildCostTile,
  buildTop10Tile,
} from "./tiles-outcomes";
import { buildClicksTile, buildExistingVsNewTile, buildTopPagesTile } from "./tiles-search";

const from = "2026-01-01";
const to = "2026-01-30";
const names = { domain: "example.com", label: "Example" };

function points(start: string, end: string, clicks: number | null) {
  return eachDate(start, end).map((dateKey) => ({ clicks, dateKey }));
}

const marker: ChartMarker = {
  dateKey: "2026-01-10",
  id: "note-example",
  kind: "note",
  title: "Published the guide",
};

export function sampleChallengeBody(): ChallengeReportBody {
  const current = points(from, to, 4);
  current[9] = { clicks: 12, dateKey: "2026-01-10" };
  return challengeReportBodySchema.parse(
    assembleChallengeReport({
      generatedAt: "2026-02-01T00:00:00.000Z",
      lessons: { dropped: "Paused the glossary.", unknown: "", worked: "The guide earned clicks." },
      period: { days: 30, from, to },
      settled: {
        activeDays: {
          status: "fulfilled",
          value: buildActiveDaysTile({ activeDates: ["2026-01-02", "2026-01-10"], from, to }),
        },
        aiAnswers: {
          status: "fulfilled",
          value: buildAiAnswersTile({
            connected: true,
            day1: from,
            end: to,
            names,
            prompts: [{ id: "prompt-1", text: "inventory software" }],
            samples: [
              {
                answerText: "Example is one option.",
                at: "2026-01-20T00:00:00.000Z",
                engine: "chat_gpt",
                promptId: "prompt-1",
              },
            ],
          }),
        },
        clicks: {
          status: "fulfilled",
          value: buildClicksTile({
            connected: true,
            current,
            markers: [marker],
            previous: points("2025-12-02", "2025-12-31", 2),
          }),
        },
        conversions: {
          status: "fulfilled",
          value: buildConversionsTile({
            connected: true,
            current: 6,
            goals: ["Demo request"],
            previous: 2,
          }),
        },
        cost: {
          status: "fulfilled",
          value: buildCostTile({
            aiAnswersMinor: 120,
            days: 30,
            other: [],
            rankChecksMinor: 300,
            subscriptions: [{ currency: "USD", minor: 900 }],
          }),
        },
        existingVsNew: {
          status: "fulfilled",
          value: buildExistingVsNewTile({
            connected: true,
            existingClicks: 40,
            existingPages: 8,
            hasSnapshot: true,
            newClicks: 10,
            newPages: 2,
          }),
        },
        top10: {
          status: "fulfilled",
          value: buildTop10Tile({
            end: [{ keyword: "inventory software", position: 4 }],
            hasChecks: true,
            start: [{ keyword: "inventory software", position: 18 }],
            tracked: 1,
          }),
        },
        topPages: {
          status: "fulfilled",
          value: buildTopPagesTile({
            connected: true,
            pages: [{ clicks: 20, path: "/guide" }],
          }),
        },
      },
      stage: "day30",
    }),
  );
}

export function disconnectedChallengeBody(): ChallengeReportBody {
  const body = sampleChallengeBody();
  return challengeReportBodySchema.parse({
    ...body,
    sources: [],
    tiles: {
      ...body.tiles,
      clicks: unavailableTile("not_connected", "search_console"),
      conversions: unavailableTile("not_connected", "conversions"),
      cost: unavailableTile("no_data", "empty"),
      existingVsNew: unavailableTile("no_data", "no_snapshot"),
      topPages: unavailableTile("not_connected", "search_console"),
    },
  });
}
