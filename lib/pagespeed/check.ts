import { pagePathForProject, pagePathHash, projectPageUrl } from "@/lib/pages/page-path";
import { fetchPageSpeed, PageSpeedError } from "@/lib/pagespeed/client";
import type { PageVitalsStrategy } from "@/lib/pagespeed/view";
import { storedStatus } from "@/lib/pagespeed/view";

const SAMPLE_LIMIT = 15;
const SELECTION_LIMIT = 25;
const CONCURRENCY = 2;
const STRATEGIES = ["mobile", "desktop"] as const satisfies readonly PageVitalsStrategy[];

export type VitalsTarget = { pageId?: string; path: string; url: string };

type PageRecord = { id: string };

export type VitalsStore = {
  pageVitals: {
    upsert(args: {
      create: VitalsWrite & { pageId: string; projectId: string };
      update: VitalsWrite;
      where: { pageId_strategy: { pageId: string; strategy: PageVitalsStrategy } };
    }): Promise<unknown>;
  };
  projectPage: {
    upsert(args: {
      create: {
        firstSeenAt: Date;
        lastSeenAt: Date;
        path: string;
        pathHash: string;
        projectId: string;
      };
      select: { id: true };
      update: { path: string };
      where: { projectId_pathHash: { pathHash: string; projectId: string } };
    }): Promise<PageRecord>;
  };
};

type VitalsWrite = {
  checkedAt: Date;
  cls: number;
  inpMs: number | null;
  lcpMs: number;
  source: "field" | "lab" | "origin";
  status: "good" | "needs_improvement" | "poor" | "unknown";
  strategy: PageVitalsStrategy;
};

export type VitalsCheckCode = "invalid_key" | "ok" | "quota";

export function auditTargets(
  domain: string,
  pages: readonly { finalUrl?: string; url: string }[],
): VitalsTarget[] {
  const seen = new Set<string>();
  const targets: VitalsTarget[] = [];
  for (const page of pages) {
    if (targets.length >= SAMPLE_LIMIT) break;
    const path = pagePathForProject(domain, page.finalUrl || page.url);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    targets.push({ path, url: projectPageUrl(domain, path) });
  }
  return targets;
}

export function selectedTargets(
  domain: string,
  pages: readonly { id: string; path: string }[],
  paths: readonly string[],
): VitalsTarget[] {
  const byPath = new Map(pages.map((page) => [page.path, page]));
  const targets: VitalsTarget[] = [];
  for (const path of paths) {
    if (targets.length >= SELECTION_LIMIT) break;
    const page = byPath.get(path);
    if (!page) continue;
    targets.push({ pageId: page.id, path: page.path, url: projectPageUrl(domain, page.path) });
  }
  return targets;
}

async function ensurePage(store: VitalsStore, projectId: string, path: string, now: Date) {
  return store.projectPage.upsert({
    create: { firstSeenAt: now, lastSeenAt: now, path, pathHash: pagePathHash(path), projectId },
    select: { id: true },
    update: { path },
    where: { projectId_pathHash: { pathHash: pagePathHash(path), projectId } },
  });
}

async function storeReading(
  store: VitalsStore,
  projectId: string,
  target: VitalsTarget,
  strategy: PageVitalsStrategy,
  reading: {
    cls: number | null;
    inpMs: number | null;
    lcpMs: number | null;
    source: VitalsWrite["source"];
  },
  now: Date,
) {
  if (reading.lcpMs == null || reading.cls == null) return false;
  const pageId = target.pageId ?? (await ensurePage(store, projectId, target.path, now)).id;
  const write: VitalsWrite = {
    checkedAt: now,
    cls: reading.cls,
    inpMs: reading.inpMs,
    lcpMs: reading.lcpMs,
    source: reading.source,
    status: storedStatus({ cls: reading.cls, inpMs: reading.inpMs, lcpMs: reading.lcpMs }),
    strategy,
  };
  await store.pageVitals.upsert({
    create: { ...write, pageId, projectId },
    update: write,
    where: { pageId_strategy: { pageId, strategy } },
  });
  return true;
}

export async function checkPageVitals(input: {
  apiKey: string;
  fetch?: typeof fetch;
  now?: Date;
  projectId: string;
  signal?: AbortSignal;
  store: VitalsStore;
  targets: readonly VitalsTarget[];
}): Promise<{ checked: number; code: VitalsCheckCode }> {
  const now = input.now ?? new Date();
  let checked = 0;
  let cursor = 0;
  let stop: "invalid_key" | "quota" | null = null;

  async function worker() {
    while (!stop) {
      const index = cursor;
      cursor += 1;
      const target = input.targets[index];
      if (!target) return;
      for (const strategy of STRATEGIES) {
        if (stop) return;
        try {
          const reading = await fetchPageSpeed(target.url, strategy, {
            apiKey: input.apiKey,
            fetch: input.fetch,
            signal: input.signal,
          });
          const stored = await storeReading(
            input.store,
            input.projectId,
            target,
            strategy,
            reading,
            now,
          );
          if (stored) checked += 1;
        } catch (error) {
          if (!(error instanceof PageSpeedError)) continue;
          if (error.code === "quota" || error.code === "invalid_key") {
            stop = error.code;
            return;
          }
        }
      }
    }
  }

  const workers = Math.min(CONCURRENCY, input.targets.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return { checked, code: stop ?? "ok" };
}
