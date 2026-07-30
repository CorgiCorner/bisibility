import { describe, expect, it } from "vitest";
import {
  dataForSeoBacklinksHistory,
  dataForSeoBacklinksRows,
  dataForSeoBacklinksSummary,
} from "./dataforseo-backlinks-payload";
import backlinksSuccess from "./fixtures/backlinks/backlinks-success.json";
import billingError from "./fixtures/backlinks/billing-error-40200.json";
import emptyProfile from "./fixtures/backlinks/empty-profile-40501.json";
import historySuccess from "./fixtures/backlinks/history-success.json";
import invalidFieldCharged from "./fixtures/backlinks/invalid-field-charged.json";
import invalidFieldNotCharged from "./fixtures/backlinks/invalid-field-not-charged.json";
import summarySuccess from "./fixtures/backlinks/summary-success.json";

describe("DataForSEO backlinks payload parsers", () => {
  it("maps summary metrics and coalesces referring key spellings", () => {
    expect(dataForSeoBacklinksSummary(summarySuccess)).toEqual({
      costCents: 2,
      summary: {
        backlinksTotal: 1685,
        brokenBacklinks: 4,
        brokenPages: 2,
        dofollowPct: 61,
        domainRank: 37,
        lostBacklinks: 12,
        lostReferringDomains: 1,
        newBacklinks: 34,
        newReferringDomains: 3,
        referringDomainsTotal: 48,
        referringPages: 1422,
        spamScore: 3,
      },
    });
  });

  it("maps monthly history and coalesces both referring key spellings", () => {
    expect(dataForSeoBacklinksHistory(historySuccess)).toEqual({
      costCents: 2,
      rows: [
        {
          lostLinks: 8,
          lostReferringDomains: 2,
          month: "2025-07",
          newLinks: 22,
          newReferringDomains: 4,
        },
        {
          lostLinks: 9,
          lostReferringDomains: 1,
          month: "2025-08",
          newLinks: 31,
          newReferringDomains: 5,
        },
      ],
    });
  });

  it("maps authority, status, flags, link count, dates, and both spam keys", () => {
    const page = dataForSeoBacklinksRows(backlinksSuccess);

    expect(page.costCents).toBe(3);
    expect(page.totalCount).toBe(1685);
    expect(page.rows).toEqual([
      {
        anchor: "archived store",
        domainAuthority: 42,
        firstSeen: "2025-12-01",
        flags: ["nofollow", "ugc"],
        linksCount: 2,
        lostAt: "2026-07-02",
        sourceDomain: "lost.example",
        sourceUrl: "https://lost.example/archive",
        spamScore: 7,
        status: "lost",
        targetUrl: "https://acme-store.com/",
      },
      {
        anchor: "",
        domainAuthority: 91,
        firstSeen: "2026-07-20",
        flags: ["sponsored", "image"],
        linksCount: 1,
        lostAt: null,
        sourceDomain: "images.example",
        sourceUrl: "https://images.example/gallery",
        spamScore: 2,
        status: "new",
        targetUrl: "https://acme-store.com/products/widget",
      },
      {
        anchor: "Acme",
        domainAuthority: 63,
        firstSeen: "2024-05-01",
        flags: ["sitewide"],
        linksCount: 120,
        lostAt: null,
        sourceDomain: "network.example",
        sourceUrl: "https://network.example/footer",
        spamScore: 11,
        status: "active",
        targetUrl: "https://acme-store.com/",
      },
    ]);
  });

  it("treats 40501 no-results responses as empty success", () => {
    expect(dataForSeoBacklinksSummary(emptyProfile)).toMatchObject({
      costCents: 2,
      summary: { backlinksTotal: 0, referringDomainsTotal: 0 },
    });
    expect(dataForSeoBacklinksHistory(emptyProfile)).toEqual({ costCents: 2, rows: [] });
    expect(dataForSeoBacklinksRows(emptyProfile)).toEqual({
      costCents: 2,
      rows: [],
      totalCount: 0,
    });
  });

  it("maps 402xx and balance messages to a billing signal", () => {
    expect(() => dataForSeoBacklinksRows(billingError)).toThrowError(
      expect.objectContaining({ name: "DataForSeoBillingError" }),
    );
  });

  it("distinguishes charged and not-charged Invalid Field failures", () => {
    expect(() => dataForSeoBacklinksRows(invalidFieldNotCharged)).toThrowError(
      expect.objectContaining({
        charged: false,
        costCents: null,
        name: "DataForSeoValidationError",
      }),
    );
    expect(() => dataForSeoBacklinksRows(invalidFieldCharged)).toThrowError(
      expect.objectContaining({
        charged: true,
        costCents: 2,
        name: "DataForSeoValidationError",
      }),
    );
  });
});
