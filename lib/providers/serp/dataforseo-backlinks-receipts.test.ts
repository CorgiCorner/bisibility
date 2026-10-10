import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dataForSeoProvider } from "./dataforseo";
import { createDataForSeoBacklinksMethods } from "./dataforseo-backlinks";

const credentials = { login: "fixture@example.com", password: "fixture-password" };
const target = { includeSubdomains: true, target: "example.com", targetScope: "site" as const };
const failure = { status_code: 40501, status_message: "History unavailable" };
const receipts = [
  ["explicit zero", { cost: 0 }, [{ ...failure, cost: 0 }], 0],
  ["positive cost", { cost: 0.002 }, [{ ...failure, cost: 0.002 }], 0.2],
  ["all task costs", {}, [{ ...failure, cost: 0 }], 0],
  ["missing costs", {}, [failure], null],
  ["incomplete task costs", {}, [{ ...failure, cost: 0 }, failure], null],
  ["malformed root with valid tasks", { cost: "0" }, [{ ...failure, cost: 0 }], null],
  ["negative root with valid tasks", { cost: -1 }, [{ ...failure, cost: 0 }], null],
  ["null root with valid tasks", { cost: null }, [{ ...failure, cost: 0 }], null],
] as const;

function envelope(root: object, tasks: readonly unknown[]) {
  return { status_code: 20000, ...root, tasks };
}

afterEach(() => vi.unstubAllGlobals());

describe("backlinks failed-request cost contract", () => {
  it.each(receipts)(
    "preserves %s in the adapter payload parser",
    async (_name, root, tasks, costCents) => {
      const request = vi.fn().mockResolvedValue(envelope(root, tasks));
      const methods = createDataForSeoBacklinksMethods({ request });
      await expect(methods.fetchBacklinksHistory(credentials, target)).rejects.toMatchObject({
        costCents,
      });
      expect(request).toHaveBeenCalledOnce();
    },
  );

  it.each(receipts)(
    "preserves %s through the full provider adapter",
    async (_name, root, tasks, costCents) => {
      const fetchMock = vi.fn().mockResolvedValue(Response.json(envelope(root, tasks)));
      vi.stubGlobal("fetch", fetchMock);
      const fetchHistory = dataForSeoProvider.fetchBacklinksHistory;
      if (!fetchHistory) throw new Error("Backlinks history is unavailable.");
      await expect(fetchHistory(credentials, target)).rejects.toMatchObject({
        costCents,
        code: "provider_transient",
      });
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  it("rejects a nonfinite failed receipt through the full adapter", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          '{"status_code":20000,"cost":1e400,"tasks":[{"status_code":40501,"status_message":"History unavailable","cost":0}]}',
          { headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const fetchHistory = dataForSeoProvider.fetchBacklinksHistory;
    if (!fetchHistory) throw new Error("Backlinks history is unavailable.");
    await expect(fetchHistory(credentials, target)).rejects.toMatchObject({ costCents: null });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([40200, 40210])(
    "keeps billing status %s fatal despite explicit zero",
    async (status_code) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          Response.json(
            envelope({ cost: 0 }, [
              { status_code, cost: 0, status_message: "Billing unavailable" },
            ]),
          ),
        );
      vi.stubGlobal("fetch", fetchMock);
      const fetchHistory = dataForSeoProvider.fetchBacklinksHistory;
      if (!fetchHistory) throw new Error("Backlinks history is unavailable.");
      await expect(fetchHistory(credentials, target)).rejects.toMatchObject({
        costCents: 0,
        code: "provider_billing",
      });
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  it.each([401, 403])("keeps HTTP %s authentication failure fatal", async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ cost: 0 }, { status }));
    vi.stubGlobal("fetch", fetchMock);
    const fetchHistory = dataForSeoProvider.fetchBacklinksHistory;
    if (!fetchHistory) throw new Error("Backlinks history is unavailable.");
    await expect(fetchHistory(credentials, target)).rejects.toMatchObject({
      name: "ProviderAuthError",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([40104, 40201])(
    "keeps account status %s fatal despite zero cost",
    async (status_code) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(Response.json(envelope({ cost: 0 }, [{ status_code, cost: 0 }])));
      vi.stubGlobal("fetch", fetchMock);
      const fetchHistory = dataForSeoProvider.fetchBacklinksHistory;
      if (!fetchHistory) throw new Error("Backlinks history is unavailable.");
      await expect(fetchHistory(credentials, target)).rejects.toMatchObject({
        costCents: 0,
        code: "provider_account_restricted",
      });
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  it.each([
    ["explicit null", { cost: null }],
    ["malformed", { cost: "0" }],
    ["negative", { cost: -1 }],
  ])(
    "rejects observed %s failure cost before a journal can replace unknown with zero",
    async (_name, root) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(Response.json(envelope(root, [{ ...failure, cost: 0 }])));
      vi.stubGlobal("fetch", fetchMock);
      const fetchHistory = dataForSeoProvider.fetchBacklinksHistory;
      if (!fetchHistory) throw new Error("Backlinks history is unavailable.");
      const observer = { begin: vi.fn().mockResolvedValue("attempt_fixture"), settle: vi.fn() };
      await expect(
        fetchHistory({ ...credentials, usageObserver: observer }, target),
      ).rejects.toBeInstanceOf(ProviderUsagePersistenceError);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(observer.settle).toHaveBeenCalledExactlyOnceWith(
        "attempt_fixture",
        expect.objectContaining({ failed: true, costCents: null }),
      );
    },
  );

  it("keeps a nonfinite observed failure amount unknown", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          '{"status_code":20000,"cost":1e400,"tasks":[{"status_code":40501,"status_message":"History unavailable","cost":0}]}',
          { headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const fetchHistory = dataForSeoProvider.fetchBacklinksHistory;
    if (!fetchHistory) throw new Error("Backlinks history is unavailable.");
    const observer = { begin: vi.fn().mockResolvedValue("attempt_fixture"), settle: vi.fn() };
    await expect(
      fetchHistory({ ...credentials, usageObserver: observer }, target),
    ).rejects.toBeInstanceOf(ProviderUsagePersistenceError);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(observer.settle).toHaveBeenCalledExactlyOnceWith(
      "attempt_fixture",
      expect.objectContaining({ failed: true, costCents: null }),
    );
  });

  it.each([
    ["missing", {}, [failure], null],
    ["explicit zero", { cost: 0 }, [{ ...failure, cost: 0 }], 0],
  ] as const)(
    "settles %s observed failure without guessing or replay",
    async (_name, root, tasks, costCents) => {
      const fetchMock = vi.fn().mockResolvedValue(Response.json(envelope(root, tasks)));
      vi.stubGlobal("fetch", fetchMock);
      const fetchHistory = dataForSeoProvider.fetchBacklinksHistory;
      if (!fetchHistory) throw new Error("Backlinks history is unavailable.");
      const observer = { begin: vi.fn().mockResolvedValue("attempt_fixture"), settle: vi.fn() };
      const called = fetchHistory({ ...credentials, usageObserver: observer }, target);
      if (costCents === null)
        await expect(called).rejects.toBeInstanceOf(ProviderUsagePersistenceError);
      else await expect(called).rejects.toMatchObject({ costCents: 0, code: "provider_transient" });
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(observer.settle).toHaveBeenCalledExactlyOnceWith(
        "attempt_fixture",
        expect.objectContaining({ failed: true, costCents }),
      );
    },
  );

  it("keeps accounting failure fatal without another outbound request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json(envelope({ cost: 0 }, [{ ...failure, cost: 0 }])));
    vi.stubGlobal("fetch", fetchMock);
    const fetchHistory = dataForSeoProvider.fetchBacklinksHistory;
    if (!fetchHistory) throw new Error("Backlinks history is unavailable.");
    const observer = {
      begin: vi.fn().mockResolvedValue("attempt_fixture"),
      settle: vi.fn().mockRejectedValue(new Error("fixture accounting failure")),
    };
    await expect(
      fetchHistory({ ...credentials, usageObserver: observer }, target),
    ).rejects.toBeInstanceOf(ProviderUsagePersistenceError);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(observer.settle).toHaveBeenCalledOnce();
  });
});
