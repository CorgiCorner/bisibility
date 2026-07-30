import { describe, expect, it, vi } from "vitest";
import { createDataForSeoBacklinksMethods } from "./dataforseo-backlinks";
import type { DataForSeoResponse } from "./dataforseo-payload";
import backlinksSuccess from "./fixtures/backlinks/backlinks-success.json";
import historySuccess from "./fixtures/backlinks/history-success.json";
import summarySuccess from "./fixtures/backlinks/summary-success.json";

const credentials = { login: "login", password: "secret" };
const target = {
  includeSubdomains: true,
  target: "acme-store.com",
  targetScope: "site" as const,
};

function response(value: unknown) {
  return value as DataForSeoResponse;
}

describe("createDataForSeoBacklinksMethods", () => {
  it("calls the summary endpoint with the binding payload", async () => {
    const request = vi.fn().mockResolvedValue(response(summarySuccess));
    const methods = createDataForSeoBacklinksMethods({ request });

    await expect(methods.fetchBacklinksSummary(credentials, target)).resolves.toMatchObject({
      costCents: 2,
      summary: { domainRank: 37 },
    });
    expect(request).toHaveBeenCalledWith(
      "https://api.dataforseo.com/v3/backlinks/summary/live",
      credentials,
      {
        backlinks_status_type: "all",
        exclude_internal_backlinks: true,
        include_indirect_links: false,
        include_subdomains: true,
        rank_scale: "one_hundred",
        target: "acme-store.com",
      },
    );
  });

  it("uses the last 12 full months for site history", async () => {
    const request = vi.fn().mockResolvedValue(response(historySuccess));
    const methods = createDataForSeoBacklinksMethods({
      now: () => new Date("2026-07-24T15:00:00.000Z"),
      request,
    });

    await expect(methods.fetchBacklinksHistory(credentials, target)).resolves.toMatchObject({
      costCents: 2,
      rows: [{ month: "2025-07" }, { month: "2025-08" }],
    });
    expect(request).toHaveBeenCalledWith(
      "https://api.dataforseo.com/v3/backlinks/history/live",
      credentials,
      expect.objectContaining({
        backlinks_status_type: "all",
        date_from: "2025-07-01",
        date_to: "2026-06-30",
        exclude_internal_backlinks: true,
        include_indirect_links: false,
        include_subdomains: true,
        rank_scale: "one_hundred",
      }),
    );
  });

  it("does not make a paid history call for page scope", async () => {
    const request = vi.fn();
    const methods = createDataForSeoBacklinksMethods({ request });

    await expect(
      methods.fetchBacklinksHistory(credentials, {
        ...target,
        target: "https://acme-store.com/products/widget",
        targetScope: "page",
      }),
    ).resolves.toEqual({ costCents: 0, rows: [] });
    expect(request).not.toHaveBeenCalled();
  });

  it("passes rows mode and caps offset at ten times the fetched limit", async () => {
    const request = vi.fn().mockResolvedValue(response(backlinksSuccess));
    const methods = createDataForSeoBacklinksMethods({ request });

    await expect(
      methods.fetchBacklinksRows(credentials, {
        ...target,
        limit: 300,
        mode: "one_per_domain",
        offset: 9_000,
      }),
    ).resolves.toMatchObject({ costCents: 3, totalCount: 1685 });
    expect(request).toHaveBeenCalledWith(
      "https://api.dataforseo.com/v3/backlinks/backlinks/live",
      credentials,
      {
        backlinks_status_type: "all",
        exclude_internal_backlinks: true,
        include_indirect_links: false,
        include_subdomains: true,
        limit: 300,
        mode: "one_per_domain",
        offset: 3_000,
        rank_scale: "one_hundred",
        target: "acme-store.com",
      },
    );
  });
});
