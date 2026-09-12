import "server-only";

import { prisma } from "@/lib/db/prisma";
import { demoResearchStorageState } from "@/lib/demo/research-storage";
import { z } from "zod";
import { annotateResearchRows, researchAnnotationScope } from "./result-annotation";
import type { KeywordResearchRow, KeywordResearchSourceDiagnostic } from "./types";

const sourceSchema = z.enum(["idea", "related", "suggestion"]);
const sourceDiagnosticSchema = z.object({
  cached: z.boolean(),
  costCents: z.number().int(),
  reason: z
    .enum([
      "budget_exhausted",
      "cost_limit",
      "in_progress",
      "needs_reauth",
      "no_source",
      "previous_source_failed",
      "provider_error",
      "rate_limited",
      "result_limit",
      "unsupported_location",
    ])
    .optional(),
  returned: z.number().int(),
  source: sourceSchema,
  status: z.enum(["failed", "ok", "skipped"]),
});
const rowSchema = z.object({
  competition: z.number().nullable(),
  cpcCents: z.number().int().nullable(),
  difficulty: z.number().nullable(),
  intent: z
    .enum(["commercial", "informational", "navigational", "transactional", "unknown"])
    .nullable(),
  keyword: z.string(),
  monthlyTrend: z.array(
    z.object({
      month: z.number().int(),
      searchVolume: z.number().int().nullable(),
      year: z.number().int(),
    }),
  ),
  searchVolume: z.number().int().nullable(),
  source: sourceSchema,
});

function partialCoverage(sources: KeywordResearchSourceDiagnostic[]) {
  return sources.some((source) => source.status !== "ok" && source.reason !== "result_limit");
}

function parseStoredSnapshot(snapshot: { rows: unknown; sources: unknown }) {
  const rows = z.array(rowSchema).safeParse(snapshot.rows);
  const sources = z.array(sourceDiagnosticSchema).safeParse(snapshot.sources);
  if (!rows.success || !sources.success) return null;
  return {
    rows: rows.data as Array<Omit<KeywordResearchRow, "alreadySaved" | "alreadyTracked">>,
    sources: sources.data as KeywordResearchSourceDiagnostic[],
  };
}

export type StoredKeywordResearchResult = {
  cached: true;
  costCents: 0;
  countryCode: string;
  fetchedAt: string;
  freshUntil: string;
  includeClickstream: boolean;
  languageCode: string;
  mode: string;
  ok: true;
  partial: boolean;
  provider: string;
  requestKey: string;
  resultLimit: number;
  rows: KeywordResearchRow[];
  savedAt: string;
  seed: string;
  sources: KeywordResearchSourceDiagnostic[];
  stale: boolean;
};

export async function findStoredKeywordResearch(input: {
  now?: Date;
  projectId: string;
  requestKey: string;
}): Promise<StoredKeywordResearchResult | null> {
  const snapshot = await prisma.keywordResearchSnapshot.findUnique({
    include: {
      project: {
        select: {
          keywords: { select: { locationRef: { select: { canonicalKey: true } }, text: true } },
          savedKeywords: {
            select: { countryCode: true, languageCode: true, normalizedText: true },
          },
        },
      },
    },
    where: { projectId_requestKey: { projectId: input.projectId, requestKey: input.requestKey } },
  });
  if (!snapshot) return null;
  const parsed = parseStoredSnapshot(snapshot);
  if (!parsed) return null;
  return {
    cached: true,
    costCents: 0,
    countryCode: snapshot.countryCode,
    fetchedAt: snapshot.fetchedAt.toISOString(),
    includeClickstream: snapshot.includeClickstream,
    languageCode: snapshot.languageCode,
    mode: snapshot.mode,
    ok: true,
    partial: partialCoverage(parsed.sources),
    provider: snapshot.provider,
    requestKey: snapshot.requestKey,
    resultLimit: snapshot.resultLimit,
    rows: annotateResearchRows(
      parsed.rows,
      snapshot.project,
      researchAnnotationScope(snapshot.countryCode, snapshot.languageCode),
    ),
    seed: snapshot.seed,
    sources: parsed.sources,
    ...demoResearchStorageState({
      freshUntil: snapshot.freshUntil,
      now: input.now,
      savedAt: snapshot.updatedAt,
    }),
  };
}

export async function listStoredKeywordResearch(input: { now?: Date; projectId: string }) {
  const snapshots = await prisma.keywordResearchSnapshot.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      countryCode: true,
      freshUntil: true,
      includeClickstream: true,
      languageCode: true,
      mode: true,
      provider: true,
      requestKey: true,
      resultLimit: true,
      seed: true,
      sources: true,
      updatedAt: true,
    },
    where: { projectId: input.projectId },
  });
  return snapshots.flatMap((snapshot) => {
    const parsed = z.array(sourceDiagnosticSchema).safeParse(snapshot.sources);
    if (!parsed.success) return [];
    return [
      {
        countryCode: snapshot.countryCode,
        includeClickstream: snapshot.includeClickstream,
        languageCode: snapshot.languageCode,
        mode: snapshot.mode,
        partial: partialCoverage(parsed.data),
        provider: snapshot.provider,
        requestKey: snapshot.requestKey,
        resultLimit: snapshot.resultLimit,
        seed: snapshot.seed,
        ...demoResearchStorageState({
          freshUntil: snapshot.freshUntil,
          now: input.now,
          savedAt: snapshot.updatedAt,
        }),
      },
    ];
  });
}
