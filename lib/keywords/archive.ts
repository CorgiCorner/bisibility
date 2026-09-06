import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

type KeywordArchiveClient = Pick<Prisma.TransactionClient, "keyword">;

export function archiveKeyword(keywordId: string, client: KeywordArchiveClient = prisma) {
  return client.keyword.updateMany({
    data: { archivedAt: new Date() },
    where: { archivedAt: null, id: keywordId },
  });
}

export function restoreKeyword(keywordId: string, client: KeywordArchiveClient = prisma) {
  return client.keyword.updateMany({
    data: { archivedAt: null },
    where: { archivedAt: { not: null }, id: keywordId },
  });
}
