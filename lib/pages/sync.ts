import "server-only";

import { prisma } from "@/lib/db/prisma";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { classifyManualPageLines } from "./manual-lines";
import { observeProjectPages } from "./observations";
import { pagePathHash } from "./page-path";
import { readPageSyncSources } from "./sync-read";
import { writePageObservations } from "./sync-write";
import { applyAutoJoinPageTagRules } from "./tag-rule-apply";
import type { AddManualProjectPagesResult, SyncProjectPagesResult } from "./types";

function empty(
  projectId: string,
  status: SyncProjectPagesResult["status"],
): SyncProjectPagesResult {
  return { omitted: 0, pages: 0, projectId, sources: 0, status, truncated: false };
}

export async function syncProjectPages(
  projectId: string,
  options: { now: Date },
): Promise<SyncProjectPagesResult> {
  try {
    const project = await prisma.project.findFirst({
      select: { domain: true, id: true },
      where: { OR: [{ id: projectId }, { publicId: projectId }] },
    });
    if (!project) return { ...empty(projectId, "skipped"), reason: "project_not_found" };
    const domain = trackedProjectDomain(project.domain);
    if (!domain) return { ...empty(project.id, "skipped"), reason: "missing_domain" };

    const reads = await readPageSyncSources(project.id);
    const observed = observeProjectPages({ ...reads, domain, now: options.now });
    const written = await writePageObservations(project.id, observed.pages, options.now);
    try {
      await applyAutoJoinPageTagRules(project.id);
    } catch {
      // One tag rule must not fail the page registry sync.
    }
    return {
      omitted: observed.omitted,
      pages: written.pages,
      projectId: project.id,
      sources: written.sources,
      status: "ok",
      truncated: observed.truncated || reads.truncated,
    };
  } catch (error: unknown) {
    return {
      ...empty(projectId, "error"),
      error: error instanceof Error ? error.message : "Project page sync failed.",
    };
  }
}

export async function syncProjectPagesForAllProjects(now: Date) {
  const projects = await prisma.project.findMany({ select: { id: true } });
  let failed = 0;
  let pages = 0;
  let truncated = 0;
  for (const project of projects) {
    const result = await syncProjectPages(project.id, { now });
    if (result.status === "error") failed += 1;
    else {
      pages += result.pages;
      if (result.truncated) truncated += 1;
    }
  }
  return { failed, pages, projects: projects.length, truncated };
}

export async function addManualProjectPages(
  projectId: string,
  urls: readonly string[],
  actor: { id: string },
  now = new Date(),
): Promise<AddManualProjectPagesResult> {
  const project = await prisma.project.findFirst({
    select: { domain: true, id: true },
    where: { OR: [{ id: projectId }, { publicId: projectId }] },
  });
  const domain = project ? trackedProjectDomain(project.domain) : null;
  const classified = classifyManualPageLines(domain, urls);
  if (!project || !domain || classified.paths.length === 0) {
    return { added: 0, existing: 0, rejected: classified.rejected };
  }

  const hashes = classified.paths.map((path) => pagePathHash(path));
  const existingRows = await prisma.$queryRaw<{ path: string }[]>`
    SELECT p.path
    FROM "project_pages" p
    JOIN "project_page_sources" s ON s."pageId" = p.id AND s.source = 'manual'
    WHERE p."projectId" = ${project.id} AND p."pathHash" = ANY(${hashes}::text[])
  `;
  const existingPaths = new Set(existingRows.map((row) => row.path));
  await writePageObservations(
    project.id,
    classified.paths.map((path) => ({
      firstSeenAt: now,
      lastSeenAt: now,
      path,
      sources: [
        {
          detail: { addedBy: actor.id },
          firstSeenAt: now,
          lastSeenAt: now,
          source: "manual",
        },
      ],
    })),
    now,
  );
  return {
    added: classified.paths.filter((path) => !existingPaths.has(path)).length,
    existing: classified.paths.filter((path) => existingPaths.has(path)).length,
    rejected: classified.rejected,
  };
}
