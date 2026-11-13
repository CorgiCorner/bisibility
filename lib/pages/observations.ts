import { jsonEntries } from "@/lib/sitemap/snapshot";
import { pagePathForProject } from "./page-path";
import type { ProjectPageSourceKind } from "./types";

export const MAX_PROJECT_PAGES_PER_SYNC = 50_000;

export type SourceObservation = {
  detail: Record<string, unknown> | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  source: ProjectPageSourceKind;
};

export type PageObservation = {
  firstSeenAt: Date;
  lastSeenAt: Date;
  path: string;
  sources: SourceObservation[];
};

export type ObserveProjectPagesInput = {
  citations: { firstSeenAt: Date; lastSeenAt: Date; url: string }[];
  domain: string;
  keywords: {
    checkedAt: Date | null;
    createdAt: Date;
    expectedUrl: string | null;
    targetUrl: string | null;
  }[];
  manual: { detail: unknown; firstSeenAt: Date; lastSeenAt: Date; path: string }[];
  now: Date;
  presences: { createdAt: Date; lastListedAt: Date | null; url: string }[];
  searchPages: { firstSeenAt: Date; lastSeenAt: Date; page: string }[];
  snapshots: { entries: unknown; fetchedAt: Date; sitemapUrl: string }[];
  truncatedSources?: boolean;
};

export type ObserveProjectPagesResult = {
  omitted: number;
  pages: PageObservation[];
  truncated: boolean;
};

function earlier(left: Date, right: Date) {
  return left <= right ? left : right;
}

function later(left: Date, right: Date) {
  return left >= right ? left : right;
}

function detailObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return { ...value };
}

function mergeSitemapDetail(
  current: Record<string, unknown> | null,
  next: Record<string, unknown> | null,
) {
  const urls = new Set<string>([
    ...(Array.isArray(current?.sitemapUrls) ? (current.sitemapUrls as string[]) : []),
    ...(Array.isArray(next?.sitemapUrls) ? (next.sitemapUrls as string[]) : []),
  ]);
  return {
    listed: current?.listed === true || next?.listed === true,
    ...(urls.size > 0 ? { sitemapUrls: [...urls].sort() } : {}),
  };
}

function mergeStamps(stamps: SourceObservation[]) {
  const bySource = new Map<ProjectPageSourceKind, SourceObservation>();
  for (const stamp of stamps) {
    const current = bySource.get(stamp.source);
    if (!current) {
      bySource.set(stamp.source, { ...stamp, detail: stamp.detail ? { ...stamp.detail } : null });
      continue;
    }
    current.firstSeenAt = earlier(current.firstSeenAt, stamp.firstSeenAt);
    current.lastSeenAt = later(current.lastSeenAt, stamp.lastSeenAt);
    if (stamp.source === "sitemap") {
      current.detail = mergeSitemapDetail(current.detail, stamp.detail);
    }
  }
  return [...bySource.values()].sort((left, right) => left.source.localeCompare(right.source));
}

export function observeProjectPages(input: ObserveProjectPagesInput): ObserveProjectPagesResult {
  const stamps = new Map<string, SourceObservation[]>();
  const add = (path: string | null, stamp: SourceObservation) => {
    if (!path) return;
    const list = stamps.get(path) ?? [];
    list.push(stamp);
    stamps.set(path, list);
  };

  const listed = new Map<string, { first: Date; last: Date; urls: Set<string> }>();
  for (const snapshot of input.snapshots) {
    for (const entry of jsonEntries(snapshot.entries)) {
      const path = pagePathForProject(input.domain, entry.loc);
      if (!path) continue;
      const current = listed.get(path);
      if (!current) {
        listed.set(path, {
          first: snapshot.fetchedAt,
          last: snapshot.fetchedAt,
          urls: new Set([snapshot.sitemapUrl]),
        });
        continue;
      }
      current.urls.add(snapshot.sitemapUrl);
      current.first = earlier(current.first, snapshot.fetchedAt);
      current.last = later(current.last, snapshot.fetchedAt);
    }
  }

  const presences = new Map<string, { createdAt: Date; lastListedAt: Date | null }>();
  for (const presence of input.presences) {
    const path = pagePathForProject(input.domain, presence.url);
    if (!path) continue;
    const current = presences.get(path);
    if (!current) {
      presences.set(path, presence);
      continue;
    }
    current.createdAt = earlier(current.createdAt, presence.createdAt);
    if (
      presence.lastListedAt &&
      (!current.lastListedAt || presence.lastListedAt > current.lastListedAt)
    ) {
      current.lastListedAt = presence.lastListedAt;
    }
  }

  for (const [path, row] of listed) {
    const presence = presences.get(path);
    const seen = presence?.lastListedAt;
    add(path, {
      detail: { listed: true, sitemapUrls: [...row.urls].sort() },
      firstSeenAt: presence ? earlier(row.first, presence.createdAt) : row.first,
      lastSeenAt: seen && seen > row.last ? seen : row.last,
      source: "sitemap",
    });
  }
  for (const [path, presence] of presences) {
    if (listed.has(path)) continue;
    const seen = presence.lastListedAt ?? presence.createdAt;
    add(path, {
      detail: { listed: false },
      firstSeenAt: earlier(presence.createdAt, seen),
      lastSeenAt: seen,
      source: "sitemap",
    });
  }

  for (const row of input.searchPages) {
    add(pagePathForProject(input.domain, row.page), {
      detail: null,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
      source: "search_console",
    });
  }

  for (const keyword of input.keywords) {
    const target = keyword.targetUrl ? pagePathForProject(input.domain, keyword.targetUrl) : null;
    const expected = keyword.expectedUrl
      ? pagePathForProject(input.domain, keyword.expectedUrl)
      : null;
    if (target && target === expected) {
      add(target, {
        detail: null,
        firstSeenAt: keyword.checkedAt
          ? earlier(keyword.createdAt, keyword.checkedAt)
          : keyword.createdAt,
        lastSeenAt: input.now,
        source: "rank_tracker",
      });
      continue;
    }
    if (target) {
      add(target, {
        detail: null,
        firstSeenAt: keyword.createdAt,
        lastSeenAt: input.now,
        source: "rank_tracker",
      });
    }
    if (expected && keyword.checkedAt) {
      add(expected, {
        detail: null,
        firstSeenAt: keyword.checkedAt,
        lastSeenAt: keyword.checkedAt,
        source: "rank_tracker",
      });
    }
  }

  for (const citation of input.citations) {
    add(pagePathForProject(input.domain, citation.url), {
      detail: null,
      firstSeenAt: citation.firstSeenAt,
      lastSeenAt: citation.lastSeenAt,
      source: "ai_citation",
    });
  }

  for (const manual of input.manual) {
    add(pagePathForProject(input.domain, manual.path), {
      detail: detailObject(manual.detail),
      firstSeenAt: manual.firstSeenAt,
      lastSeenAt: manual.lastSeenAt,
      source: "manual",
    });
  }

  const paths = [...stamps.keys()].sort((left, right) => left.localeCompare(right));
  const kept = paths.slice(0, MAX_PROJECT_PAGES_PER_SYNC);
  const pages = kept.map((path) => {
    const sources = mergeStamps(stamps.get(path) ?? []);
    return {
      firstSeenAt: sources.reduce(
        (value, source) => earlier(value, source.firstSeenAt),
        sources[0]?.firstSeenAt ?? input.now,
      ),
      lastSeenAt: sources.reduce(
        (value, source) => later(value, source.lastSeenAt),
        sources[0]?.lastSeenAt ?? input.now,
      ),
      path,
      sources,
    };
  });
  return {
    omitted: Math.max(0, paths.length - MAX_PROJECT_PAGES_PER_SYNC),
    pages,
    truncated: paths.length > MAX_PROJECT_PAGES_PER_SYNC || input.truncatedSources === true,
  };
}
