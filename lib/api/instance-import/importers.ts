import "server-only";

import type { ApiContext } from "@/lib/api/context";
import { createKeywords } from "@/lib/api/keyword-create";
import { makePublicId } from "@/lib/db/public-id";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { Project } from "./jobs";
import type { ImportKeyword } from "./schemas";

export type KeywordMaps = {
  byKey: Map<string, string>;
  bySource: Map<string, string>;
};

export type SourceKeywordIds = Record<
  string,
  {
    device: NonNullable<ImportKeyword["device"]>;
    location: ImportKeyword["location"];
    text: string;
  }
>;

export function keywordKey(input: Pick<ImportKeyword, "device" | "keyword" | "location">) {
  return `${input.keyword}\u0000${input.location}\u0000${input.device}`;
}

function keywordCreateItems(keywords: ImportKeyword[]) {
  return keywords.map(({ id: _id, rankingHistory: _history, ...keyword }) => keyword);
}

function createContext(project: Project, url: URL, keywords: ImportKeyword[]): ApiContext {
  const req = new Request(url.toString(), {
    body: JSON.stringify(keywordCreateItems(keywords)),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  return {
    auth: {
      apiKey: {
        id: "migration_token",
        name: "Migration token",
        prefix: "mig_",
        projectId: project.id,
        scopes: ["read", "write", "admin"],
      },
      project,
    },
    headers: new Headers(),
    instance: `urn:bisibility:api:cloud-import:${url.pathname}`,
    method: "POST",
    path: ["cloud", "import"],
    req,
    url,
  };
}

export async function createKeywordRows(
  project: Project,
  url: URL,
  keywords: ImportKeyword[],
  client: Prisma.TransactionClient,
) {
  if (keywords.length === 0) return { created: 0, skipped: 0 };
  const response = await createKeywords(createContext(project, url, keywords), project.id, client);
  if (!response.ok) throw new Error("Keyword import failed.");
  const body = (await response.json()) as { created?: unknown; skipped?: unknown };
  return {
    created: typeof body.created === "number" ? body.created : 0,
    skipped: typeof body.skipped === "number" ? body.skipped : 0,
  };
}

export async function loadKeywordMaps(
  projectId: string,
  keywords: ImportKeyword[],
  client: Prisma.TransactionClient,
): Promise<KeywordMaps> {
  const empty = { byKey: new Map<string, string>(), bySource: new Map<string, string>() };
  if (keywords.length === 0) return empty;

  const rows = await client.keyword.findMany({
    select: { device: true, id: true, location: true, text: true },
    where: {
      OR: keywords.map((keyword) => ({
        device: keyword.device,
        location: keyword.location,
        text: keyword.keyword,
      })),
      projectId,
    },
  });
  const byKey = new Map(
    rows.map((row) => [
      keywordKey({ device: row.device, keyword: row.text, location: row.location }),
      row.id,
    ]),
  );
  const bySource = new Map(
    keywords.flatMap((keyword) => {
      const id = keyword.id ? byKey.get(keywordKey(keyword)) : null;
      return id && keyword.id ? [[keyword.id, id] as const] : [];
    }),
  );
  return { byKey, bySource };
}

export async function loadKeywordMapsForProject(
  client: Prisma.TransactionClient,
  projectId: string,
  sourceKeywordIds: SourceKeywordIds = {},
): Promise<KeywordMaps> {
  const rows = await client.keyword.findMany({
    select: { device: true, id: true, location: true, text: true },
    where: { projectId },
  });
  const byKey = new Map(
    rows.map((row) => [
      keywordKey({ device: row.device, keyword: row.text, location: row.location }),
      row.id,
    ]),
  );
  const bySource = new Map(
    Object.entries(sourceKeywordIds).flatMap(([sourceId, source]) => {
      const id = byKey.get(
        keywordKey({ device: source.device, keyword: source.text, location: source.location }),
      );
      return id ? [[sourceId, id] as const] : [];
    }),
  );
  return { byKey, bySource };
}

function historyRowKey(keywordId: string, checkedAt: Date) {
  return `${keywordId}\0${checkedAt.getTime()}`;
}

export async function importHistory(
  keywords: ImportKeyword[],
  byKey: Map<string, string>,
  client: Prisma.TransactionClient,
) {
  const received = keywords.reduce((count, keyword) => count + keyword.rankingHistory.length, 0);
  const incoming = keywords.flatMap((keyword) => {
    const keywordId = byKey.get(keywordKey(keyword));
    return keywordId
      ? keyword.rankingHistory.map((check) => ({
          attemptCount: 1,
          checkedAt: check.checkedAt,
          degradedToCountry: false,
          keywordId,
          normalizationVersion: check.normalizationVersion,
          position: check.position ?? null,
          previousPosition: check.previousPosition ?? null,
          provider: check.provider,
          publicId: makePublicId("check"),
          rankingUrl: check.rankingUrl ?? null,
          requestedDepth: check.requestedDepth,
          status: "completed",
          viaFallback: false,
        }))
      : [];
  });
  if (incoming.length === 0) return { imported: 0, received, skipped: 0 };

  // Re-imports of the same package must not duplicate history: skip rows whose
  // (keyword, checkedAt) already exists in the destination project's history.
  const checkedAtTimes = incoming.map((row) => row.checkedAt.getTime());
  const existing = await client.rankCheck.findMany({
    select: { checkedAt: true, keywordId: true },
    where: {
      checkedAt: {
        gte: new Date(Math.min(...checkedAtTimes)),
        lte: new Date(Math.max(...checkedAtTimes)),
      },
      keywordId: { in: [...new Set(incoming.map((row) => row.keywordId))] },
    },
  });
  const seen = new Set(existing.map((row) => historyRowKey(row.keywordId, row.checkedAt)));
  const data = incoming.filter((row) => {
    const key = historyRowKey(row.keywordId, row.checkedAt);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (data.length > 0) await client.rankCheck.createMany({ data, skipDuplicates: true });
  return {
    imported: data.length,
    received,
    skipped: incoming.length - data.length,
  };
}

export type ImportTransactionClient = Prisma.TransactionClient;
