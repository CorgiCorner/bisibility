import "server-only";

import { parseActionInput } from "@/lib/actions/_shared";
import { addTags } from "@/lib/actions/keyword-helpers";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { refreshKeywordDispatchStates } from "@/lib/rank-check/dispatcher-state";
import type { ApiContext } from "./context";
import { scheduleFromBulk } from "./keyword-utils";
import { requireApiPublicId } from "./public-id";
import { resourceResponse } from "./responses";
import { keywordBulkSchema } from "./schemas";

type BulkKeyword = {
  id: string;
  publicId: string;
};

function byRequestedId(keywords: BulkKeyword[]) {
  const map = new Map<string, BulkKeyword>();
  for (const keyword of keywords) {
    map.set(keyword.publicId, keyword);
  }
  return map;
}

function results(ids: string[], map: Map<string, BulkKeyword>, status: string) {
  return ids.map((id) => {
    const keyword = map.get(id);
    return keyword
      ? { keyword_id: keyword.publicId, status }
      : { keyword_id: id, status: "not_found" };
  });
}

export async function bulkKeywords(ctx: ApiContext) {
  const body = await ctx.req.json();
  const data = parseActionInput(keywordBulkSchema, body);
  const keywordIds = data.keyword_ids.map((id) => requireApiPublicId(id, "kw"));
  const keywords = await prisma.keyword.findMany({
    select: { id: true, publicId: true },
    where: {
      publicId: { in: keywordIds },
      projectId: ctx.auth.project.id,
    },
  });
  const map = byRequestedId(keywords);
  const foundIds = keywords.map((keyword) => keyword.id);
  const responseStatus = data.operation === "delete" ? "deleted" : "updated";

  if (data.operation === "delete") {
    await prisma.keyword.deleteMany({ where: { id: { in: foundIds } } });
  } else if (data.operation === "set_target_url") {
    await prisma.keyword.updateMany({
      data: { targetUrl: data.target_url ?? null },
      where: { id: { in: foundIds } },
    });
  } else if (data.operation === "set_frequency") {
    await prisma.$transaction(async (tx) => {
      await Promise.all(
        foundIds.map((keywordId) => {
          const schedule = scheduleFromBulk(data, keywordId);
          return schedule
            ? tx.keywordSchedule.upsert({
                create: { ...schedule, keywordId },
                update: schedule,
                where: { keywordId },
              })
            : Promise.resolve();
        }),
      );
      await refreshKeywordDispatchStates({ keywordIds: foundIds }, tx);
    });
  } else if (data.operation === "add_tags") {
    await addTags(prisma, ctx.auth.project.id, foundIds, data.tags ?? []);
  } else if (data.operation === "remove_tags") {
    const tags = await prisma.tag.findMany({
      select: { id: true },
      where: { name: { in: data.tags ?? [] }, projectId: ctx.auth.project.id },
    });
    await prisma.keywordTag.deleteMany({
      where: { keywordId: { in: foundIds }, tagId: { in: tags.map((tag) => tag.id) } },
    });
  }

  await writeAudit({
    action: `keyword.bulk.${data.operation}`,
    actorId: null,
    after: { count: foundIds.length, operation: data.operation },
    projectId: ctx.auth.project.id,
    targetId: ctx.auth.project.publicId,
    targetType: "project",
  });

  return resourceResponse(
    { operation: data.operation, results: results(data.keyword_ids, map, responseStatus) },
    { headers: ctx.headers },
  );
}
