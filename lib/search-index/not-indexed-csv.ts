import "server-only";

import { prisma } from "@/lib/db/prisma";
import { csvRow } from "@/lib/ui/csv";
import { currentPageIndexingScope } from "./current-rows";
import { connectionForProject } from "./service";

const EXPORT_CAP = 50_000;

export type NotIndexedCsv = {
  csv: string;
  filename: string;
  rows: number;
  truncated: boolean;
};

export async function notIndexedUrlsCsv(projectId: string): Promise<NotIndexedCsv> {
  const { property } = await connectionForProject(projectId);
  const { where } = await currentPageIndexingScope(projectId, property, false);
  const stored = await prisma.urlPresence.findMany({
    where: {
      AND: [where, { checkedAt: { not: null }, inspectionError: null, NOT: { verdict: "PASS" } }],
    },
    orderBy: [{ coverageState: "asc" }, { url: "asc" }],
    select: { coverageState: true, url: true },
    take: EXPORT_CAP + 1,
  });
  const truncated = stored.length > EXPORT_CAP;
  const rows = truncated ? stored.slice(0, EXPORT_CAP) : stored;
  const csv = [
    csvRow(["url", "reason"]),
    ...rows.map((row) => csvRow([row.url, row.coverageState ?? ""])),
  ].join("\n");
  return { csv, filename: "page-indexing-not-indexed.csv", rows: rows.length, truncated };
}
