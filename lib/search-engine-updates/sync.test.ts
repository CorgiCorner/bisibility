import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parseSearchEngineIncidents } from "./parse";
import { syncSearchEngineUpdates, upsertSearchEngineUpdates } from "./sync";

const fixture = JSON.parse(
  readFileSync(new URL("./google-search-status-incidents.sample.json", import.meta.url), "utf8"),
);

describe("search engine update sync", () => {
  it("upserts each parsed incident once and does not throw when the network fails", async () => {
    const upsert = vi.fn(async () => ({}));
    const now = new Date("2026-11-10T01:00:00.000Z");
    const incidents = parseSearchEngineIncidents(fixture);

    await expect(
      upsertSearchEngineUpdates(incidents, { searchEngineUpdate: { upsert } }, now),
    ).resolves.toBe(3);
    expect(upsert).toHaveBeenCalledTimes(3);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          engine: "google",
          externalId: "XhUDXP7A67iHCD2kmbVu",
          name: "September 2026 spam update",
        }),
        where: { externalId: "XhUDXP7A67iHCD2kmbVu" },
      }),
    );

    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(
      syncSearchEngineUpdates({
        fetch: fetchImpl as unknown as typeof fetch,
        store: { searchEngineUpdate: { upsert } },
      }),
    ).resolves.toEqual({ reason: "network", status: "error" });
  });

  it("returns a parse error without writing when the body is not the feed", async () => {
    const upsert = vi.fn();
    const fetchImpl = vi.fn(async () => ({
      json: async () => ({ incidents: [] }),
      ok: true,
    }));

    await expect(
      syncSearchEngineUpdates({
        fetch: fetchImpl as unknown as typeof fetch,
        store: { searchEngineUpdate: { upsert } },
      }),
    ).resolves.toEqual({ reason: "invalid", status: "error" });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("returns a network error when the feed fetch is aborted", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      expect(ms).toBe(10_000);
      const controller = new AbortController();
      controller.abort();
      return controller.signal;
    });
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
      return { json: async () => fixture, ok: true };
    });

    await expect(
      syncSearchEngineUpdates({
        fetch: fetchImpl as unknown as typeof fetch,
        store: { searchEngineUpdate: { upsert: vi.fn() } },
      }),
    ).resolves.toEqual({ reason: "network", status: "error" });
    expect(fetchImpl).toHaveBeenCalledWith(expect.any(String), {
      signal: expect.any(AbortSignal),
    });
    timeout.mockRestore();
  });
});
