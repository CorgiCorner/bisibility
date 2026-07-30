import type {
  BacklinkHistoryResult,
  BacklinkRow,
  BacklinkRowsResult,
  BacklinkSummaryResult,
} from "@/lib/providers/types";

const TOTAL_BACKLINKS = 220;
const TOTAL_DOMAINS = TOTAL_BACKLINKS - 1;

function fakeBacklinkRow(index: number): BacklinkRow {
  const isSharedDomain = index < 2;
  const sourceDomain = isSharedDomain
    ? "alpha.example"
    : `source-${String(index - 1).padStart(3, "0")}.example`;
  return {
    anchor: isSharedDomain ? "Backlinks guide" : `Resource ${index}`,
    domainAuthority: isSharedDomain ? 95 - index * 5 : index < 50 ? 80 : 40,
    firstSeen: index % 20 === 0 ? "2026-07-20" : "2026-05-10",
    flags: index % 7 === 0 ? ["nofollow"] : [],
    linksCount: 1,
    lostAt: null,
    sourceDomain,
    sourceUrl: `https://${sourceDomain}/resources/${index}`,
    spamScore: index % 9,
    status: index % 20 === 0 ? "new" : "active",
    targetUrl: `https://example.com/guides/${index % 5}`,
  };
}

const rows = Array.from({ length: TOTAL_BACKLINKS }, (_, index) => fakeBacklinkRow(index));

export function fakeBacklinksSummary(): BacklinkSummaryResult {
  return {
    costCents: 0,
    summary: {
      backlinksTotal: TOTAL_BACKLINKS,
      brokenBacklinks: 0,
      brokenPages: 0,
      dofollowPct: 85,
      domainRank: 72,
      lostBacklinks: 12,
      lostReferringDomains: 8,
      newBacklinks: 11,
      newReferringDomains: 10,
      referringDomainsTotal: TOTAL_DOMAINS,
      referringPages: TOTAL_BACKLINKS,
      spamScore: 2,
    },
  };
}

export function fakeBacklinksHistory(): BacklinkHistoryResult {
  return {
    costCents: 0,
    rows: Array.from({ length: 12 }, (_, index) => {
      const date = new Date(Date.UTC(2025, 7 + index, 1));
      return {
        lostLinks: 3 + (index % 3),
        lostReferringDomains: 1,
        month: date.toISOString().slice(0, 7),
        newLinks: 8 + index,
        newReferringDomains: 2 + (index % 2),
      };
    }),
  };
}

export function fakeBacklinksRows(input: { limit: number; offset: number }): BacklinkRowsResult {
  return {
    costCents: 0,
    rows: rows.slice(input.offset, input.offset + input.limit),
    totalCount: TOTAL_BACKLINKS,
  };
}
