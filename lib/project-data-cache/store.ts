import "server-only";
import { snapshotMode, snapshotProvider } from "@/lib/backlinks/stored";
import { prisma } from "@/lib/db/prisma";
import {
  domainOverviewSnapshotCachedUntil,
  domainOverviewSnapshotFreshness,
} from "@/lib/domain-overview/cache-policy";
import {
  instanceLookupTtl,
  withProjectCachePolicy,
} from "@/lib/provider-lookups/project-cache-policy";
import { listRedisDataCache, removeRedisDataCache, removeStoredRedisCopies } from "./redis-store";
import type { DataCacheEntry, DataCachePage } from "./schema";

type Cursor = { stage: number; position: string };
function decode(value: string): Cursor {
  if (value === "0") return { stage: 0, position: "0" };
  const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  if (
    !Number.isInteger(parsed.stage) ||
    parsed.stage < 0 ||
    parsed.stage > 3 ||
    typeof parsed.position !== "string" ||
    parsed.position.length > 128
  )
    throw new Error("Invalid cache cursor.");
  return parsed;
}
const encode = (value: Cursor) => Buffer.from(JSON.stringify(value)).toString("base64url");
export async function listProjectDataCache(
  projectId: string,
  cursor: string,
  ttl: number | null,
  providers: Record<string, string> = {},
): Promise<DataCachePage> {
  let state = decode(cursor);
  let available = true;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (state.stage === 0) {
      if (!/^\d+$/.test(state.position)) throw new Error("Invalid cache cursor.");
      const page = await listRedisDataCache(projectId, state.position, ttl, providers);
      available &&= page.available;
      const next =
        page.cursor === "0" || !page.available
          ? { stage: 1, position: "0" }
          : { stage: 0, position: page.cursor };
      if (page.entries.length || next.stage === 0) {
        const refs = page.entries.flatMap((entry) => (entry.reportRef ? [entry.reportRef] : []));
        if (refs.length) {
          const reports = await prisma.agentReport.findMany({
            where: { projectId, publicId: { in: refs } },
            select: { publicId: true, title: true },
          });
          const titles = new Map(reports.map((report) => [report.publicId, report.title]));
          page.entries = page.entries.map((entry) =>
            entry.reportRef
              ? {
                  ...entry,
                  keyword: titles.get(entry.reportRef) ?? null,
                  reportRef: titles.has(entry.reportRef) ? entry.reportRef : undefined,
                }
              : entry,
          );
        }
        return { ...page, cursor: encode(next) };
      }
      state = next;
      continue;
    }
    const page = await withProjectCachePolicy(ttl, () =>
      storedPage(projectId, state, ttl, providers),
    );
    if (page.entries.length || page.cursor === "0") return { ...page, available };
    state = decode(page.cursor);
  }
  return { available, entries: [], cursor: encode(state) };
}
async function storedPage(
  projectId: string,
  state: Cursor,
  ttl: number | null,
  providers: Record<string, string>,
): Promise<DataCachePage> {
  const now = new Date();
  const after = state.position === "0" ? {} : { id: { gt: state.position } };
  const recent = {
    fetchedAt: {
      gt: new Date(
        now.getTime() - (ttl ?? instanceLookupTtl(state.stage === 1 ? "bl:" : "do:")) * 1000,
      ),
    },
  };
  let entries: DataCacheEntry[] = [];
  let last: string | undefined;
  let hasMore = false;
  if (state.stage === 1) {
    const rows = await prisma.backlinkSnapshot.findMany({
      where: { projectId, ...after, ...recent, expiresAt: { gt: now } },
      select: {
        id: true,
        target: true,
        targetScope: true,
        summary: true,
        fetchedAt: true,
        expiresAt: true,
      },
      orderBy: { id: "asc" },
      take: 26,
    });
    hasMore = rows.length > 25;
    entries = rows.slice(0, 25).map((row) => {
      const provider =
        row.summary && typeof row.summary === "object" && "_provider" in row.summary
          ? String(row.summary._provider)
          : undefined;
      return {
        token: `dbb:${row.id}`,
        module: "backlinks",
        source: "backlinks",
        keyword: row.target,
        country: row.targetScope,
        language: "",
        provider: provider ? providers[provider] : undefined,
        expiresAt: new Date(
          Math.min(
            row.expiresAt.getTime(),
            row.fetchedAt.getTime() + (ttl ?? instanceLookupTtl("bl:")) * 1000,
          ),
        ).toISOString(),
      };
    });
    last = rows[Math.min(rows.length, 25) - 1]?.id;
  } else if (state.stage === 2) {
    const rows = await prisma.domainOverviewSnapshot.findMany({
      where: { projectId, ...after, ...domainOverviewSnapshotFreshness(now) },
      select: {
        id: true,
        target: true,
        provider: true,
        locationCode: true,
        languageCode: true,
        fetchedAt: true,
        cachedUntil: true,
      },
      orderBy: { id: "asc" },
      take: 26,
    });
    hasMore = rows.length > 25;
    entries = rows.slice(0, 25).map(
      (row): DataCacheEntry => ({
        token: `dbd:${row.id}`,
        module: "domain_overview",
        source: "overview",
        keyword: row.target,
        provider: providers[row.provider],
        country: String(row.locationCode),
        language: row.languageCode,
        expiresAt: domainOverviewSnapshotCachedUntil(row),
      }),
    );
    last = rows[Math.min(rows.length, 25) - 1]?.id;
  } else {
    const rows = await prisma.agentReport.findMany({
      where: {
        projectId,
        ...after,
        kind: "site_audit",
        OR: [
          {
            cacheReuseUntil: { gt: now },
            createdAt: { gt: new Date(now.getTime() - (ttl ?? 300) * 1000) },
          },
          {
            cacheReuseUntil: null,
            createdAt: { gt: new Date(now.getTime() - Math.min(ttl ?? 300, 300) * 1000) },
          },
        ],
      },
      select: { id: true, title: true, createdAt: true, cacheReuseUntil: true },
      orderBy: { id: "asc" },
      take: 26,
    });
    hasMore = rows.length > 25;
    entries = rows
      .slice(0, 25)
      .map((row) => ({
        token: `dba:${row.id}`,
        module: "site_audit" as const,
        source: "site_audit" as const,
        keyword: row.title,
        country: "",
        language: "",
        expiresAt: new Date(
          Math.min(
            row.cacheReuseUntil?.getTime() ?? row.createdAt.getTime() + 300000,
            ttl === null ? Infinity : row.createdAt.getTime() + ttl * 1000,
          ),
        ).toISOString(),
      }))
      .filter((row) => Date.parse(row.expiresAt) > now.getTime());
    last = rows[Math.min(rows.length, 25) - 1]?.id;
  }
  return {
    available: true,
    entries,
    cursor:
      hasMore && last
        ? encode({ stage: state.stage, position: last })
        : state.stage === 3
          ? "0"
          : encode({ stage: state.stage + 1, position: "0" }),
  };
}
export async function removeProjectDataCache(projectId: string, token: string) {
  const [kind, id] = token.split(":");
  if (!/^[a-zA-Z0-9_-]+$/.test(id ?? "")) return removeRedisDataCache(projectId, token);
  if (kind === "dbb") {
    const row = await prisma.backlinkSnapshot.findFirst({
      where: { id, projectId },
      select: {
        id: true,
        target: true,
        targetScope: true,
        includeSubdomains: true,
        summary: true,
        fetchedAt: true,
      },
    });
    if (!row) return "invalid" as const;
    const outcome = await removeStoredRedisCopies(projectId, {
      module: "backlinks",
      target: row.target,
      scope: row.targetScope,
      provider: snapshotProvider(row.summary),
      includeSubdomains: row.includeSubdomains,
      mode: snapshotMode(row.summary),
    });
    if (outcome !== "removed") return outcome;
    await prisma.backlinkSnapshot.updateMany({
      where: { id, projectId, fetchedAt: row.fetchedAt },
      data: { expiresAt: new Date(0) },
    });
    return "removed" as const;
  }
  if (kind === "dbd") {
    const row = await prisma.domainOverviewSnapshot.findFirst({
      where: { id, projectId },
      select: {
        id: true,
        target: true,
        provider: true,
        scope: true,
        locationCode: true,
        languageCode: true,
        fetchedAt: true,
      },
    });
    if (!row) return "invalid" as const;
    const outcome = await removeStoredRedisCopies(projectId, {
      module: "domain_overview",
      target: row.target,
      provider: row.provider,
      scope: row.scope,
      locationCode: row.locationCode,
      languageCode: row.languageCode,
    });
    if (outcome !== "removed") return outcome;
    await prisma.domainOverviewSnapshot.updateMany({
      where: { id, projectId, fetchedAt: row.fetchedAt },
      data: { cachedUntil: new Date(0) },
    });
    return "removed" as const;
  }
  if (kind === "dba") {
    const result = await prisma.agentReport.updateMany({
      where: { id, projectId, kind: "site_audit" },
      data: { cacheReuseUntil: new Date(0) },
    });
    return result.count === 1 ? ("removed" as const) : ("invalid" as const);
  }
  return removeRedisDataCache(projectId, token);
}
