import "server-only";

import { RANK_CHECK_STATUS } from "@/lib/checks/status";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";

export const KEYWORD_MATCH_MAX_MARKETS_PER_TEXT = 100;

export type KeywordMatchRow = {
  countryCode: string;
  device: "desktop" | "mobile";
  keywordId: string;
  latestPosition: number | null;
  languageCode: string;
  languageLabel: string;
  location: string;
  locationKey: string;
  matchedText: string;
  previousPosition: number | null;
  rankingUrl: string | null;
  text: string;
};

type KeywordMatchQueryRow = KeywordMatchRow & {
  marketCount: bigint;
  marketNumber: bigint;
};

function normalizedTexts(texts: readonly string[]) {
  return [...new Set(texts.map((text) => text.trim().toLowerCase()))];
}

export async function findKeywordMatches(projectId: string, texts: readonly string[]) {
  const normalized = normalizedTexts(texts);
  if (normalized.length === 0) {
    return { matches: [], truncatedTexts: [] };
  }

  const rows = await prisma.$queryRaw<KeywordMatchQueryRow[]>(Prisma.sql`
    WITH matched_keywords AS (
      SELECT
        k."publicId" AS "keywordId",
        k."text",
        k."location",
        l."canonicalKey" AS "locationKey",
        l."countryCode" AS "countryCode",
        l."languageCode" AS "languageCode",
        l."languageLabel" AS "languageLabel",
        k."device"::text AS "device",
        lower(btrim(k."text")) AS "matchedText",
        rc."position" AS "latestPosition",
        rc."previousPosition" AS "previousPosition",
        rc."rankingUrl" AS "rankingUrl",
        count(*) OVER (PARTITION BY lower(btrim(k."text"))) AS "marketCount",
        row_number() OVER (
          PARTITION BY lower(btrim(k."text"))
          ORDER BY k."location", k."device", k."id"
        ) AS "marketNumber"
      FROM "keywords" k
      JOIN "locations" l ON l."id" = k."locationId"
      LEFT JOIN LATERAL (
        SELECT r."position", r."previousPosition", r."rankingUrl"
        FROM "rank_checks" r
        WHERE r."keywordId" = k."id"
          AND r."status" <> ${RANK_CHECK_STATUS.DEFERRED}
        ORDER BY r."checkedAt" DESC
        LIMIT 1
      ) rc ON true
      WHERE k."projectId" = ${projectId}
        AND lower(btrim(k."text")) IN (${Prisma.join(normalized)})
    )
    SELECT *
    FROM matched_keywords
    WHERE "marketNumber" <= ${KEYWORD_MATCH_MAX_MARKETS_PER_TEXT}
    ORDER BY "matchedText", "location", "device", "keywordId"
  `);

  return {
    matches: rows.map(
      ({ marketCount: _marketCount, marketNumber: _marketNumber, ...match }) => match,
    ),
    truncatedTexts: [
      ...new Set(
        rows
          .filter((row) => row.marketCount > BigInt(KEYWORD_MATCH_MAX_MARKETS_PER_TEXT))
          .map((row) => row.matchedText),
      ),
    ],
  };
}
