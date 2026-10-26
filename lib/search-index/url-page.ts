import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { z } from "zod";
import { pageIndexingUrlsQuerySchema } from "./report-schema";

export const pageIndexingTableQuerySchema = pageIndexingUrlsQuerySchema
  .omit({ cursor: true })
  .extend({
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    sort_by: z.enum(["url", "state", "crawl", "change"]).default("url"),
    sort_direction: z.enum(["asc", "desc"]).default("asc"),
  });
export type IndexingPageOptions = Pick<
  z.output<typeof pageIndexingTableQuerySchema>,
  "page" | "sort_by" | "sort_direction"
>;

/** Page the entire filtered set before fetching detailed rows or history. */
export async function readIndexingPage(
  where: Prisma.UrlPresenceWhereInput & { projectId: string },
  size: number,
  options: IndexingPageOptions,
) {
  const total = await prisma.urlPresence.count({ where });
  const page = Math.min(options.page, Math.max(1, Math.ceil(total / size)));
  const skip = (page - 1) * size;
  if (options.sort_by === "change") {
    const candidates = await prisma.urlPresence.findMany({
      where,
      select: { url: true },
      orderBy: { url: "asc" },
    });
    const changes = candidates.length
      ? await prisma.urlPresenceChange.groupBy({
          by: ["url"],
          where: {
            projectId: where.projectId,
            url: { in: candidates.map((row) => row.url) },
            AND: [{ previous: { not: Prisma.JsonNull } }, { previous: { not: {} } }],
          },
          _max: { at: true },
          orderBy: [{ _max: { at: options.sort_direction } }, { url: "asc" }],
        })
      : [];
    const changed = new Set(changes.map((row) => row.url));
    const ordered = [
      ...changes.map((row) => row.url),
      ...candidates.filter((row) => !changed.has(row.url)).map((row) => row.url),
    ];
    const selected = ordered.slice(skip, skip + size);
    const rows = selected.length
      ? await prisma.urlPresence.findMany({ where: { AND: [where, { url: { in: selected } }] } })
      : [];
    const positions = new Map(selected.map((url, index) => [url, index]));
    rows.sort((a, b) => (positions.get(a.url) ?? 0) - (positions.get(b.url) ?? 0));
    return { rows, total, page };
  }
  const direction = options.sort_direction;
  const orderBy: Prisma.UrlPresenceOrderByWithRelationInput[] =
    options.sort_by === "crawl"
      ? [{ lastCrawlAt: { sort: direction, nulls: "last" } }, { url: "asc" }]
      : options.sort_by === "state"
        ? [{ coverageState: { sort: direction, nulls: "last" } }, { url: "asc" }]
        : [{ url: direction }];
  const rows = await prisma.urlPresence.findMany({ where, orderBy, skip, take: size });
  return { rows, total, page };
}
