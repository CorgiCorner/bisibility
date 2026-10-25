import type { Prisma } from "@/lib/generated/prisma/client";
import type { GscSitemapStatus } from "@/lib/providers/analytics/gsc-sitemaps";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import type { discoverSitemapCandidates } from "./sitemap-candidates";

export async function persistSitemapSnapshot(
  tx: Prisma.TransactionClient,
  input: {
    projectId: string;
    property: string;
    now: Date;
    sitemaps: GscSitemapStatus[] | null;
    listError: unknown;
    discovery: Awaited<ReturnType<typeof discoverSitemapCandidates>>;
  },
) {
  const defaults = await tx.projectDefaults.findUnique({ where: { projectId: input.projectId } });
  if (defaults?.indexingSitemapAttemptAt && defaults.indexingSitemapAttemptAt > input.now) return;
  const success = input.sitemaps !== null;
  if (success) {
    await tx.pageIndexingSitemap.deleteMany({ where: { projectId: input.projectId } });
    await tx.pageIndexingSitemap.createMany({
      data: [...new Map(input.sitemaps?.map((row) => [row.path, row])).values()].map((row) => ({
        projectId: input.projectId,
        path: row.path,
        parentPath: input.discovery.parents?.get(row.path) ?? null,
        isIndex: row.isSitemapsIndex,
        childCount: input.discovery.childCounts?.get(row.path) ?? 0,
        contentType:
          [...new Set(row.contents.map((entry) => entry.type))].join(", ") || row.type || "unknown",
        isPending: row.isPending,
        errors: row.errors,
        warnings: row.warnings,
        lastSubmitted: row.lastSubmitted ? new Date(row.lastSubmitted) : null,
        lastDownloaded: row.lastDownloaded ? new Date(row.lastDownloaded) : null,
        submitted: row.contents.reduce((sum, entry) => sum + entry.submitted, 0),
        readAt: input.now,
      })),
    });
  }
  const metadata = {
    indexingSitemapAttemptAt: input.now,
    ...(success
      ? { indexingSitemapReadAt: input.now, indexingSitemapProperty: input.property }
      : {}),
    indexingSitemapLastError: success ? null : sitemapReadError(input.listError),
    indexingSitemapLastErrorAt: success ? null : input.now,
  };
  await tx.projectDefaults.upsert({
    where: { projectId: input.projectId },
    create: { projectId: input.projectId, ...metadata },
    update: metadata,
  });
}

export function sitemapReadError(error: unknown): "permission" | "unavailable" {
  if (error instanceof ProviderAuthError) return "permission";
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    [401, 403].includes(Number(error.status))
  )
    return "permission";
  return "unavailable";
}
