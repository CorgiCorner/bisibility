import "server-only";

import { prisma } from "@/lib/db/prisma";
import { fetchExpectedUrlDocument } from "./fetch";
import { resolveExpectedUrl } from "./resolve";
import type { ExpectedUrlCache, ExpectedUrlResolution } from "./types";

const documentCache: ExpectedUrlCache = new Map();

function hostname(domain: string | null) {
  if (!domain) return null;
  try {
    return new URL(domain.includes("://") ? domain : `https://${domain}`).hostname;
  } catch {
    return null;
  }
}

function canonicalBaseUrl(domain: string | null) {
  if (!domain) return null;
  try {
    return new URL(domain.includes("://") ? domain : `https://${domain}`).origin;
  } catch {
    return null;
  }
}

export async function resolveExpectedUrlForKeyword(
  keywordId: string,
): Promise<ExpectedUrlResolution> {
  try {
    const keyword = await prisma.keyword.findUnique({
      select: {
        locationRef: { select: { canonicalKey: true, countryCode: true, languageCode: true } },
        project: { select: { defaults: { select: { locationKey: true } }, domain: true } },
        projectId: true,
        targetUrl: true,
        text: true,
      },
      where: { id: keywordId },
    });
    if (!keyword) return { source: null, url: null };
    const rows = await prisma.keyword.findMany({
      select: {
        locationRef: { select: { canonicalKey: true, countryCode: true, languageCode: true } },
        targetUrl: true,
      },
      where: { projectId: keyword.projectId, text: keyword.text },
    });
    const allowedHost = hostname(keyword.project.domain);
    return resolveExpectedUrl({
      allowedHosts: allowedHost ? [allowedHost] : [],
      canonicalBaseUrl: canonicalBaseUrl(keyword.project.domain),
      canonicalRows: rows.map((row) => ({ ...row.locationRef, targetUrl: row.targetUrl })),
      defaultLocationKey: keyword.project.defaults?.locationKey,
      fetchDocument: (url) =>
        fetchExpectedUrlDocument({
          cache: documentCache,
          logger: (entry) => console.warn("expected_url_resolution", entry),
          projectId: keyword.projectId,
          url,
        }),
      logger: (entry) =>
        console.warn("expected_url_resolution", { ...entry, projectId: keyword.projectId }),
      row: { ...keyword.locationRef, targetUrl: keyword.targetUrl },
    });
  } catch (error) {
    console.warn("expected_url_resolution", {
      error: error instanceof Error ? error.message : String(error),
      reason: "keyword_resolution_failed",
    });
    return { source: null, url: null };
  }
}
