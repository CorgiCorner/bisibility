import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * The archived-keyword condition, kept in a leaf module so dispatch paths can reuse it without
 * pulling the request-scoped query stack in behind it.
 */
export const activeKeywordWhere = { archivedAt: null } satisfies Prisma.KeywordWhereInput;
