import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { emitSignal } from "@/lib/signals/emit";
import { SIGNAL_TYPES } from "@/lib/signals/types";
import { diffSitemapEntries } from "./diff";
import {
  MAX_CHILD_SITEMAPS,
  MAX_SITEMAP_ENTRIES,
  parseSitemapXml,
  type SitemapEntry,
} from "./parse";
import { contentHash, jsonEntries } from "./snapshot";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const RETENTION_DAYS = 90;
const USER_AGENT = "bisibility Sitemap Sync/1.0";

type ResolvedSitemap = {
  childSitemapCount: number;
  childSitemapsFetched: number;
  entries: SitemapEntry[];
  sitemapUrl: string;
  truncated: boolean;
  urlCount: number;
};

export type SyncSitemapForProjectResult =
  | {
      projectId: string;
      reason: "missing_domain" | "monitor_disabled" | "project_not_found";
      status: "skipped";
    }
  | {
      projectId: string;
      sitemapUrl: string;
      status: "baseline" | "unchanged";
      truncated: boolean;
      urlCount: number;
    }
  | {
      addedCount: number;
      lastmodChangedCount: number;
      projectId: string;
      removedCount: number;
      signalId: string;
      sitemapUrl: string;
      snapshotId: string;
      status: "changed";
      truncated: boolean;
      urlCount: number;
    };

export type SyncSitemapForAllProjectsResult = {
  baselined: number;
  changed: number;
  failed: number;
  projects: number;
  pruned: number;
  skipped: number;
  unchanged: number;
};

export function sitemapUrlForDomain(domain: string) {
  return `https://${domain}/sitemap.xml`;
}

async function fetchSitemapXml(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { accept: "application/xml,text/xml,*/*;q=0.1", "user-agent": USER_AGENT },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Sitemap fetch failed with HTTP ${response.status}`);
    }
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
      throw new Error(`Sitemap response exceeds ${MAX_RESPONSE_BYTES} bytes`);
    }
    const xml = await response.text();
    if (Buffer.byteLength(xml, "utf8") > MAX_RESPONSE_BYTES) {
      throw new Error(`Sitemap response exceeds ${MAX_RESPONSE_BYTES} bytes`);
    }
    return xml;
  } finally {
    clearTimeout(timeout);
  }
}

function resolveChildUrl(childUrl: string, parentUrl: string) {
  try {
    return new URL(childUrl, parentUrl).toString();
  } catch {
    return childUrl;
  }
}

function warnIfTruncated(projectId: string, sitemap: ResolvedSitemap) {
  if (!sitemap.truncated) return;
  console.warn("[sitemap] snapshot entries truncated", {
    childSitemapCount: sitemap.childSitemapCount,
    projectId,
    storedUrlCount: sitemap.entries.length,
    urlCount: sitemap.urlCount,
  });
}

async function resolveSitemap(sitemapUrl: string): Promise<ResolvedSitemap> {
  const root = parseSitemapXml(await fetchSitemapXml(sitemapUrl));
  if (root.kind === "unknown") {
    throw new Error("Sitemap response is not a urlset or sitemapindex document");
  }
  if (root.kind !== "sitemapindex") {
    return {
      childSitemapCount: root.childSitemapCount,
      childSitemapsFetched: 0,
      entries: root.entries,
      sitemapUrl,
      truncated: root.truncated,
      urlCount: root.urlCount,
    };
  }

  const entries: SitemapEntry[] = [];
  let truncated = root.truncated;
  let urlCount = 0;
  let childSitemapsFetched = 0;

  for (const childUrl of root.childSitemapUrls.slice(0, MAX_CHILD_SITEMAPS)) {
    const remaining = MAX_SITEMAP_ENTRIES - entries.length;
    if (remaining <= 0) {
      truncated = true;
      break;
    }

    const child = parseSitemapXml(await fetchSitemapXml(resolveChildUrl(childUrl, sitemapUrl)), {
      maxEntries: remaining,
    });
    childSitemapsFetched += 1;
    urlCount += child.urlCount;
    truncated = truncated || child.truncated || child.kind === "sitemapindex";
    if (child.kind === "urlset") {
      entries.push(...child.entries);
    }
  }

  return {
    childSitemapCount: root.childSitemapCount,
    childSitemapsFetched,
    entries,
    sitemapUrl,
    truncated,
    urlCount,
  };
}

function changedPayload(diff: ReturnType<typeof diffSitemapEntries>, sitemap: ResolvedSitemap) {
  return {
    added: diff.added.slice(0, 20),
    addedCount: diff.added.length,
    lastmodChangedCount: diff.lastmodChanged.length,
    removed: diff.removed.slice(0, 20),
    removedCount: diff.removed.length,
    ...(sitemap.truncated
      ? {
          storedUrlCount: sitemap.entries.length,
          truncated: true,
          urlCount: sitemap.urlCount,
        }
      : {}),
  };
}

export async function syncSitemapForProject(
  projectId: string,
  now: Date = new Date(),
): Promise<SyncSitemapForProjectResult> {
  const project = await prisma.project.findFirst({
    select: { domain: true, id: true, sitemapMonitoringEnabled: true },
    where: { OR: [{ id: projectId }, { publicId: projectId }] },
  });
  if (!project) return { projectId, reason: "project_not_found", status: "skipped" };
  if (project.sitemapMonitoringEnabled === false)
    return { projectId: project.id, reason: "monitor_disabled", status: "skipped" };
  if (!project.domain.trim())
    return { projectId: project.id, reason: "missing_domain", status: "skipped" };

  const sitemap = await resolveSitemap(sitemapUrlForDomain(project.domain));
  warnIfTruncated(project.id, sitemap);

  const latest = await prisma.sitemapSnapshot.findFirst({
    orderBy: { fetchedAt: "desc" },
    select: { contentHash: true, entries: true, id: true },
    where: { projectId: project.id },
  });
  const hash = contentHash(sitemap.entries);
  const snapshotData = {
    contentHash: hash,
    entries: sitemap.entries as Prisma.InputJsonValue,
    fetchedAt: now,
    projectId: project.id,
    sitemapUrl: sitemap.sitemapUrl,
    urlCount: sitemap.urlCount,
  };

  if (!latest) {
    await prisma.sitemapSnapshot.create({ data: snapshotData });
    return {
      projectId: project.id,
      sitemapUrl: sitemap.sitemapUrl,
      status: "baseline",
      truncated: sitemap.truncated,
      urlCount: sitemap.urlCount,
    };
  }
  if (latest.contentHash === hash) {
    return {
      projectId: project.id,
      sitemapUrl: sitemap.sitemapUrl,
      status: "unchanged",
      truncated: sitemap.truncated,
      urlCount: sitemap.urlCount,
    };
  }

  const diff = diffSitemapEntries(jsonEntries(latest.entries), sitemap.entries);
  const { signal, snapshot } = await prisma.$transaction(async (tx) => {
    const snapshot = await tx.sitemapSnapshot.create({ data: snapshotData });
    const signal = await emitSignal(
      {
        happenedAt: now,
        payload: changedPayload(diff, sitemap),
        projectId: project.id,
        severity: "info",
        source: "sitemap",
        type: SIGNAL_TYPES.sitemapChanged,
        url: sitemap.sitemapUrl,
      },
      tx,
    );
    return { signal, snapshot };
  });

  return {
    addedCount: diff.added.length,
    lastmodChangedCount: diff.lastmodChanged.length,
    projectId: project.id,
    removedCount: diff.removed.length,
    signalId: signal.id,
    sitemapUrl: sitemap.sitemapUrl,
    snapshotId: snapshot.id,
    status: "changed",
    truncated: sitemap.truncated,
    urlCount: sitemap.urlCount,
  };
}

export async function pruneOldSitemapSnapshots(now: Date = new Date()) {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await prisma.sitemapSnapshot.deleteMany({ where: { fetchedAt: { lt: cutoff } } });
  return result.count;
}

export async function syncSitemapForAllProjects(
  now: Date = new Date(),
): Promise<SyncSitemapForAllProjectsResult> {
  const projects = await prisma.project.findMany({
    select: { id: true },
    where: { domain: { not: "" }, sitemapMonitoringEnabled: true },
  });
  const summary = {
    baselined: 0,
    changed: 0,
    failed: 0,
    projects: projects.length,
    pruned: 0,
    skipped: 0,
    unchanged: 0,
  };

  for (const project of projects) {
    try {
      const result = await syncSitemapForProject(project.id, now);
      if (result.status === "baseline") summary.baselined += 1;
      if (result.status === "changed") summary.changed += 1;
      if (result.status === "skipped") summary.skipped += 1;
      if (result.status === "unchanged") summary.unchanged += 1;
    } catch (error) {
      summary.failed += 1;
      console.error("[sitemap] sync failed", { error, projectId: project.id });
    }
  }

  summary.pruned = await pruneOldSitemapSnapshots(now);
  return summary;
}
