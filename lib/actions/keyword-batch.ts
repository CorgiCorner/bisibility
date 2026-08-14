import { assertKeywordCapacity, lockKeywordCapacity } from "@/lib/api/resource-limits";
import type { Prisma } from "@/lib/generated/prisma/client";
import { ProjectMarketLimitExceededError } from "@/lib/markets/limits";
import { ensureKeywordProjectMarketsWithinLimit } from "@/lib/markets/registry";
import { seedKeywordDispatchStates } from "@/lib/rank-check/dispatcher-state";
import { type StoredSchedule, scheduleForKeyword } from "./_schedule";
import { makePublicId } from "./_shared";

export type KeywordBatchRow = {
  device: NonNullable<Prisma.KeywordCreateManyInput["device"]>;
  intent?: string | null;
  keyword: string;
  location: string;
  locationId: string;
  schedule: StoredSchedule | null;
  tags: string[];
  targetUrl?: string | null;
  topic?: string | null;
};

type KeywordBatchClient = Pick<
  Prisma.TransactionClient,
  | "$executeRaw"
  | "$queryRaw"
  | "keyword"
  | "keywordSchedule"
  | "keywordTag"
  | "projectMarket"
  | "tag"
>;

type StoredKeyword = {
  device: KeywordBatchRow["device"];
  id: string;
  intent: string | null;
  locationId: string;
  publicId: string;
  targetUrl: string | null;
  text: string;
  topic: string | null;
};

export type KeywordBatchSetResult = {
  accepted: Array<{ created: boolean; keyword: StoredKeyword; row: KeywordBatchRow }>;
  created: StoredKeyword[];
};

export function keywordTupleKey(text: string, locationId: string, device: string) {
  return `${locationId}\u0000${device}\u0000${text}`;
}

function rowKey(row: KeywordBatchRow) {
  return keywordTupleKey(row.keyword, row.locationId, row.device);
}

function uniqueRows(rows: readonly KeywordBatchRow[]) {
  const unique = new Map<string, KeywordBatchRow>();
  for (const row of rows) {
    if (!unique.has(rowKey(row))) unique.set(rowKey(row), row);
  }
  return unique;
}

function keywordWhere(projectId: string, rows: readonly KeywordBatchRow[]) {
  return {
    device: { in: [...new Set(rows.map((row) => row.device))] },
    locationId: { in: [...new Set(rows.map((row) => row.locationId))] },
    projectId,
    text: { in: [...new Set(rows.map((row) => row.keyword))] },
  };
}

async function attachSchedules(
  client: KeywordBatchClient,
  created: readonly StoredKeyword[],
  rowsByKey: ReadonlyMap<string, KeywordBatchRow>,
) {
  const data = created.flatMap((keyword) => {
    const schedule = rowsByKey.get(
      keywordTupleKey(keyword.text, keyword.locationId, keyword.device),
    )?.schedule;
    return schedule ? [{ ...scheduleForKeyword(schedule, keyword.id), keywordId: keyword.id }] : [];
  });
  if (data.length > 0) {
    await client.keywordSchedule.createMany({ data, skipDuplicates: true });
  }
}

async function attachTags(
  client: KeywordBatchClient,
  projectId: string,
  created: readonly StoredKeyword[],
  rowsByKey: ReadonlyMap<string, KeywordBatchRow>,
) {
  const names = [
    ...new Set(
      created.flatMap(
        (keyword) =>
          rowsByKey.get(keywordTupleKey(keyword.text, keyword.locationId, keyword.device))?.tags ??
          [],
      ),
    ),
  ];
  if (names.length === 0) return;
  await client.tag.createMany({
    data: names.map((name) => ({ name, projectId, publicId: makePublicId("tag") })),
    skipDuplicates: true,
  });
  const tags = await client.tag.findMany({
    select: { id: true, name: true },
    where: { name: { in: names }, projectId },
  });
  const tagIds = new Map(tags.map((tag) => [tag.name, tag.id]));
  const data = created.flatMap((keyword) => {
    const row = rowsByKey.get(keywordTupleKey(keyword.text, keyword.locationId, keyword.device));
    return (row?.tags ?? []).flatMap((name) => {
      const tagId = tagIds.get(name);
      return tagId ? [{ keywordId: keyword.id, tagId }] : [];
    });
  });
  if (data.length > 0) {
    await client.keywordTag.createMany({ data, skipDuplicates: true });
  }
}

export async function createKeywordBatchSet(
  client: KeywordBatchClient,
  projectId: string,
  rows: readonly KeywordBatchRow[],
): Promise<KeywordBatchSetResult> {
  if (rows.length === 0) return { accepted: [], created: [] };
  const rowsByKey = uniqueRows(rows);
  const canonicalRows = [...rowsByKey.values()];
  const limit = await lockKeywordCapacity(client, projectId);
  const marketResult = await ensureKeywordProjectMarketsWithinLimit(
    projectId,
    canonicalRows.map(({ locationId }) => ({ locationId })),
    client,
  );
  if (!marketResult.ok) {
    throw new ProjectMarketLimitExceededError(marketResult.maxMarkets);
  }
  const select = {
    device: true,
    id: true,
    intent: true,
    locationId: true,
    publicId: true,
    targetUrl: true,
    text: true,
    topic: true,
  } as const;
  const existing = await client.keyword.findMany({
    select,
    where: keywordWhere(projectId, canonicalRows),
  });
  const existingKeys = new Set(
    existing.map((keyword) => keywordTupleKey(keyword.text, keyword.locationId, keyword.device)),
  );
  const candidates = canonicalRows
    .filter((row) => !existingKeys.has(rowKey(row)))
    .map((row) => ({
      device: row.device,
      intent: row.intent ?? null,
      location: row.location,
      locationId: row.locationId,
      projectId,
      publicId: makePublicId("kw"),
      targetUrl: row.targetUrl ?? null,
      text: row.keyword,
      topic: row.topic ?? null,
    }));
  await assertKeywordCapacity(client, projectId, candidates.length, limit);
  if (candidates.length > 0) {
    await client.keyword.createMany({ data: candidates, skipDuplicates: true });
  }
  const inserted =
    candidates.length > 0
      ? await client.keyword.findMany({
          select,
          where: { publicId: { in: candidates.map((candidate) => candidate.publicId) } },
        })
      : [];
  const persisted = [...existing, ...inserted];
  const persistedByKey = new Map(
    persisted.map((keyword) => [
      keywordTupleKey(keyword.text, keyword.locationId, keyword.device),
      keyword,
    ]),
  );
  const created = inserted;
  await attachSchedules(client, created, rowsByKey);
  await attachTags(client, projectId, created, rowsByKey);
  await seedKeywordDispatchStates(
    created.map((keyword) => keyword.id),
    {},
    client,
  );

  const unclaimedCreated = new Set(created.map((keyword) => keyword.publicId));
  const accepted = rows.map((row) => {
    const keyword = persistedByKey.get(rowKey(row));
    if (!keyword) throw new Error("Keyword could not be created.");
    const created = unclaimedCreated.delete(keyword.publicId);
    return { created, keyword, row };
  });
  return { accepted, created };
}

export async function createKeywordBatch(
  client: KeywordBatchClient,
  input: Omit<KeywordBatchRow, "keyword"> & { keywords: string[]; projectId: string },
) {
  const { keywords, projectId, ...shared } = input;
  const result = await createKeywordBatchSet(
    client,
    projectId,
    keywords.map((keyword) => ({ ...shared, keyword })),
  );
  return result.created;
}
