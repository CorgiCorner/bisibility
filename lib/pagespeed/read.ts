import "server-only";

import { prisma } from "@/lib/db/prisma";
import { pagePathForProject } from "@/lib/pages/page-path";
import type {
  CoreWebVitalsCardModel,
  CoreWebVitalsRow,
  PageVitalsSource,
  PageVitalsStatus,
  PageVitalsStrategy,
} from "@/lib/pagespeed/view";
import { readingFromStored, strategyView } from "@/lib/pagespeed/view";

const SAMPLE_LIMIT = 15;

type Stored = {
  cls: { toString(): string } | number | string;
  inpMs: number | null;
  lcpMs: number;
  source: PageVitalsSource;
  status: PageVitalsStatus;
  strategy: PageVitalsStrategy;
};

function rowsFor(
  sample: readonly { path: string }[],
  byPath: Map<string, Stored[]>,
  strategy: PageVitalsStrategy,
): CoreWebVitalsRow[] {
  return sample.map((item) => {
    const stored = byPath.get(item.path)?.find((row) => row.strategy === strategy);
    if (!stored) {
      return { cls: null, inpMs: null, lcpMs: null, path: item.path, source: null, status: null };
    }
    return { ...readingFromStored(stored), path: item.path };
  });
}

export async function readCoreWebVitalsCard(input: {
  domain: string;
  pages: readonly { finalUrl?: string; url: string }[];
  projectId: string;
}): Promise<CoreWebVitalsCardModel> {
  const empty = { passCount: 0, rows: [] };
  const connection = await prisma.providerConnection.findFirst({
    select: { id: true },
    where: {
      enabled: true,
      projectId: input.projectId,
      provider: "pagespeed",
      status: "connected",
    },
  });
  if (!connection) return { connected: false, desktop: empty, mobile: empty };

  const seen = new Set<string>();
  const sample: { path: string }[] = [];
  for (const page of input.pages) {
    if (sample.length >= SAMPLE_LIMIT) break;
    const path = pagePathForProject(input.domain, page.finalUrl || page.url);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    sample.push({ path });
  }
  const records = sample.length
    ? await prisma.projectPage.findMany({
        select: {
          path: true,
          vitals: {
            select: {
              cls: true,
              inpMs: true,
              lcpMs: true,
              source: true,
              status: true,
              strategy: true,
            },
          },
        },
        where: { path: { in: sample.map((item) => item.path) }, projectId: input.projectId },
      })
    : [];
  const byPath = new Map(records.map((record) => [record.path, record.vitals]));
  return {
    connected: true,
    desktop: strategyView(rowsFor(sample, byPath, "desktop")),
    mobile: strategyView(rowsFor(sample, byPath, "mobile")),
  };
}
