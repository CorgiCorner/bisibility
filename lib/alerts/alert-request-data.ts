import "server-only";

import { prisma } from "@/lib/db/prisma";
import { cache } from "react";

const perRequestCache: typeof cache = typeof cache === "function" ? cache : (fn) => fn;

export const getRequestAlertKeywordData = perRequestCache(async (projectId: string) => {
  const [keywords, defaults] = await Promise.all([
    prisma.keyword.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        publicId: true,
        schedule: { select: { serpDepth: true } },
        tags: { select: { tag: { select: { publicId: true } }, tagId: true } },
        text: true,
      },
      where: { projectId },
    }),
    prisma.projectDefaults.findUnique({
      select: { serpDepth: true },
      where: { projectId },
    }),
  ]);

  return {
    keywords,
    labels: new Map(keywords.map((keyword) => [keyword.id, keyword.text])),
    projectDepth: defaults?.serpDepth,
  };
});
