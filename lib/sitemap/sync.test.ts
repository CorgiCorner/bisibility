import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncSitemapForAllProjects, syncSitemapForProject } from "./sync";

const mocks = vi.hoisted(() => {
  const tx = {
    signal: { create: vi.fn() },
    sitemapSnapshot: { create: vi.fn() },
  };

  return {
    emitSignal: vi.fn(),
    prisma: {
      $transaction: vi.fn(),
      project: { findFirst: vi.fn(), findMany: vi.fn() },
      sitemapSnapshot: {
        create: vi.fn(),
        deleteMany: vi.fn(),
        updateMany: vi.fn(),
        findFirst: vi.fn(),
      },
    },
    tx,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));
vi.mock("undici", async (importOriginal) => {
  const original = await importOriginal<typeof import("undici")>();
  return { ...original, fetch: (...args: Parameters<typeof fetch>) => fetch(...args) };
});
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/signals/emit", () => ({ emitSignal: mocks.emitSignal }));

const now = new Date("2026-07-04T04:45:00.000Z");

function xmlResponse(body: string, status = 200, contentLength?: number) {
  return new Response(body, {
    status,
    headers: contentLength === undefined ? {} : { "content-length": String(contentLength) },
  });
}

function urlset(urls: string[]) {
  return `<urlset>${urls.map((url) => `<url><loc>${url}</loc></url>`).join("")}</urlset>`;
}

describe("sitemap sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    mocks.emitSignal.mockResolvedValue({ id: "signal_1" });
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.tx));
    mocks.prisma.sitemapSnapshot.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "snapshot_1", ...data }),
    );
    mocks.prisma.sitemapSnapshot.deleteMany.mockResolvedValue({ count: 0 });
    mocks.tx.sitemapSnapshot.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "snapshot_2", ...data }),
    );
  });

  it.each([
    ["stable complete read", true, false],
    ["completeness recovery", false, true],
  ] as const)("advances only the matching unchanged %s", async (_name, complete, rewrite) => {
    const urls = ["https://example.com/a"];
    const { contentHash } = await import("./snapshot");
    vi.mocked(fetch).mockImplementation(async () => xmlResponse(urlset(urls)));
    mocks.prisma.project.findFirst.mockResolvedValue({
      id: "project_1",
      domain: "example.com",
      syncPauses: [],
    });
    mocks.prisma.sitemapSnapshot.findFirst.mockResolvedValue({
      id: "snapshot_old",
      complete,
      contentHash: contentHash(urls.map((loc) => ({ loc }))),
      entries: urls.map((loc) => ({ loc })),
    });
    await expect(syncSitemapForProject("project_1", now)).resolves.toMatchObject({
      status: "unchanged",
    });
    expect(mocks.prisma.sitemapSnapshot.updateMany).toHaveBeenCalledWith({
      where: {
        id: "snapshot_old",
        projectId: "project_1",
        contentHash: contentHash(urls.map((loc) => ({ loc }))),
        fetchedAt: { lt: now },
      },
      data: {
        fetchedAt: now,
        complete: true,
        urlCount: 1,
        ...(rewrite ? { entries: urls.map((loc) => ({ loc })) } : {}),
      },
    });
    expect(mocks.prisma.sitemapSnapshot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: "project_1", sitemapUrl: "https://example.com/sitemap.xml" },
      }),
    );
    expect(mocks.emitSignal).not.toHaveBeenCalled();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("stores a baseline snapshot without emitting a signal", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async () => xmlResponse(urlset(["https://example.com/"])));
    mocks.prisma.project.findFirst.mockResolvedValue({
      domain: "example.com",
      id: "project_1",
      syncPauses: [],
    });
    mocks.prisma.sitemapSnapshot.findFirst.mockResolvedValue(null);

    await expect(syncSitemapForProject("project_1", now)).resolves.toMatchObject({
      sitemapUrl: "https://example.com/sitemap.xml",
      status: "baseline",
      urlCount: 1,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/sitemap.xml",
      expect.objectContaining({
        headers: expect.objectContaining({ "user-agent": expect.any(String) }),
      }),
    );
    expect(mocks.prisma.sitemapSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entries: [{ loc: "https://example.com/" }],
        fetchedAt: now,
        projectId: "project_1",
        sitemapUrl: "https://example.com/sitemap.xml",
        urlCount: 1,
      }),
    });
    expect(mocks.emitSignal).not.toHaveBeenCalled();
  });

  it("stores changed snapshots and emits a capped payload", async () => {
    const addedUrls = Array.from({ length: 25 }, (_, index) => `https://example.com/new-${index}`);
    const currentXml = `
      <urlset>
        ${addedUrls.map((url) => `<url><loc>${url}</loc></url>`).join("")}
        <url><loc>https://example.com/common</loc><lastmod>2026-07-04</lastmod></url>
      </urlset>
    `;
    vi.mocked(fetch).mockImplementation(async () => xmlResponse(currentXml));
    mocks.prisma.project.findFirst.mockResolvedValue({
      domain: "example.com",
      id: "project_1",
      syncPauses: [],
    });
    mocks.prisma.sitemapSnapshot.findFirst.mockResolvedValue({
      contentHash: "previous-hash",
      entries: [
        { loc: "https://example.com/old" },
        { lastmod: "2026-07-01", loc: "https://example.com/common" },
      ],
      id: "snapshot_1",
    });

    await expect(syncSitemapForProject("project_1", now)).resolves.toMatchObject({
      addedCount: 25,
      lastmodChangedCount: 1,
      removedCount: 1,
      signalId: "signal_1",
      status: "changed",
    });

    expect(mocks.tx.sitemapSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ projectId: "project_1", urlCount: 26 }),
    });
    expect(mocks.emitSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        happenedAt: now,
        payload: {
          added: addedUrls.slice(0, 20),
          addedCount: 25,
          lastmodChangedCount: 1,
          removed: ["https://example.com/old"],
          removedCount: 1,
        },
        projectId: "project_1",
        severity: "info",
        source: "sitemap",
        type: "sitemap.changed",
        url: "https://example.com/sitemap.xml",
      }),
      mocks.tx,
    );
  });

  it("fails instead of emitting when the response is not a sitemap document", async () => {
    vi.mocked(fetch).mockImplementation(async () =>
      xmlResponse("<html><body>Not found</body></html>"),
    );
    mocks.prisma.project.findFirst.mockResolvedValue({
      domain: "example.com",
      id: "project_1",
      syncPauses: [],
    });

    await expect(syncSitemapForProject("project_1", now)).rejects.toThrow(
      "not a urlset or sitemapindex",
    );
    expect(mocks.emitSignal).not.toHaveBeenCalled();
    expect(mocks.prisma.sitemapSnapshot.create).not.toHaveBeenCalled();
  });

  it.each([404, 500])("does not record a failed HTTP %s as a read", async (status) => {
    vi.mocked(fetch).mockImplementation(async () => xmlResponse("<urlset/>", status));
    mocks.prisma.project.findFirst.mockResolvedValue({
      domain: "example.com",
      id: "project_1",
      syncPauses: [],
    });
    await expect(syncSitemapForProject("project_1", now)).rejects.toThrow();
    expect(mocks.prisma.sitemapSnapshot.create).not.toHaveBeenCalled();
    expect(mocks.prisma.sitemapSnapshot.updateMany).not.toHaveBeenCalled();
  });
  it.each(["entry cap", "child cap", "nested index"])(
    "continues monitoring a truncated %s",
    async (kind) => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const index = (urls: string[]) =>
        `<sitemapindex>${urls.map((url) => `<sitemap><loc>${url}</loc></sitemap>`).join("")}</sitemapindex>`;
      if (kind === "entry cap")
        vi.mocked(fetch).mockImplementation(async () =>
          xmlResponse(urlset(Array.from({ length: 5001 }, (_, i) => `https://example.com/${i}`))),
        );
      else
        vi.mocked(fetch)
          .mockResolvedValueOnce(
            xmlResponse(
              index(
                Array.from(
                  { length: kind === "child cap" ? 6 : 1 },
                  (_, i) => `https://example.com/${i}.xml`,
                ),
              ),
            ),
          )
          .mockImplementation(async () =>
            xmlResponse(
              kind === "nested index"
                ? index(["https://example.com/grandchild.xml"])
                : urlset(["https://example.com/a"]),
            ),
          );
      mocks.prisma.project.findFirst.mockResolvedValue({
        domain: "example.com",
        id: "project_1",
        syncPauses: [],
      });
      mocks.prisma.sitemapSnapshot.findFirst.mockResolvedValue({
        id: "old",
        contentHash: "old",
        entries: [{ loc: "https://example.com/old" }],
      });
      const result = await syncSitemapForProject("project_1", now);
      expect(result).toMatchObject({ status: "changed", truncated: true });
      const stored = mocks.tx.sitemapSnapshot.create.mock.calls[0]?.[0].data;
      expect(stored.complete).toBe(false);
      expect(stored.urlCount).toBe(kind === "entry cap" ? 5001 : kind === "child cap" ? 5 : 0);
      expect(mocks.emitSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            truncated: true,
            urlCount: stored.urlCount,
            storedUrlCount: stored.entries.length,
          }),
        }),
        mocks.tx,
      );
      const { normalizeStoredSitemapReads, sitemapMembershipForPage } = await import(
        "@/lib/pages/sitemap-read-model"
      );
      const read = normalizeStoredSitemapReads([stored], "example.com", true, now);
      expect(
        sitemapMembershipForPage(read, "example.com", "/unobserved", new Date("2026-01-01")),
      ).toBeNull();
    },
  );
  it.each([true, false])(
    "updates completeness atomically on unchanged content: %s",
    async (complete) => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      vi.mocked(fetch).mockImplementation(async () =>
        xmlResponse(
          complete
            ? "<urlset/>"
            : "<sitemapindex><sitemap><loc>https://example.com/child.xml</loc></sitemap></sitemapindex>",
        ),
      );
      const { contentHash } = await import("./snapshot");
      mocks.prisma.project.findFirst.mockResolvedValue({
        domain: "example.com",
        id: "project_1",
        syncPauses: [],
      });
      mocks.prisma.sitemapSnapshot.findFirst.mockResolvedValue({
        id: "old",
        complete: !complete,
        contentHash: contentHash([]),
        entries: [],
      });
      await expect(syncSitemapForProject("project_1", now)).resolves.toMatchObject({
        status: "unchanged",
        truncated: !complete,
      });
      expect(mocks.prisma.sitemapSnapshot.updateMany).toHaveBeenCalledWith({
        where: {
          id: "old",
          projectId: "project_1",
          contentHash: contentHash([]),
          fetchedAt: { lt: now },
        },
        data: { fetchedAt: now, complete, urlCount: 0, entries: [] },
      });
      expect(mocks.emitSignal).not.toHaveBeenCalled();
    },
  );

  it("skips the HTTP provider when a sitemap pause row exists", async () => {
    mocks.prisma.project.findFirst.mockResolvedValue({
      domain: "example.com",
      id: "project_1",
      syncPauses: [{ kind: "sitemap_fetch" }],
    });
    vi.mocked(fetch).mockImplementation(() => {
      throw new Error("Paused sitemap reached the provider");
    });
    await expect(syncSitemapForProject("project_1", now)).resolves.toMatchObject({
      reason: "monitor_disabled",
      status: "skipped",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("skips a project whose sitemap monitor is disabled", async () => {
    mocks.prisma.project.findFirst.mockResolvedValue({
      domain: "example.com",
      id: "project_1",
      syncPauses: [{ kind: "sitemap_fetch" }],
    });

    await expect(syncSitemapForProject("project_1", now)).resolves.toEqual({
      projectId: "project_1",
      reason: "monitor_disabled",
      status: "skipped",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails when the response declares or exceeds the size cap", async () => {
    const fetchMock = vi.mocked(fetch);
    mocks.prisma.project.findFirst.mockResolvedValue({
      domain: "example.com",
      id: "project_1",
      syncPauses: [],
    });

    fetchMock.mockResolvedValueOnce(
      xmlResponse(urlset(["https://example.com/"]), 200, 11 * 1024 * 1024),
    );
    await expect(syncSitemapForProject("project_1", now)).rejects.toThrow("exceeds");

    fetchMock.mockResolvedValueOnce(xmlResponse(`<urlset>${"x".repeat(11 * 1024 * 1024)}`));
    await expect(syncSitemapForProject("project_1", now)).rejects.toThrow("exceeds");
    expect(mocks.emitSignal).not.toHaveBeenCalled();
  });

  it("swallows per-project fetch failures while syncing all projects", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(xmlResponse(urlset(["https://two.example.com/"])));
    mocks.prisma.project.findMany.mockResolvedValue([{ id: "project_1" }, { id: "project_2" }]);
    mocks.prisma.project.findFirst
      .mockResolvedValueOnce({ domain: "one.example.com", id: "project_1", syncPauses: [] })
      .mockResolvedValueOnce({ domain: "two.example.com", id: "project_2", syncPauses: [] });
    mocks.prisma.sitemapSnapshot.findFirst.mockResolvedValue(null);

    await expect(syncSitemapForAllProjects(now)).resolves.toMatchObject({
      baselined: 1,
      failed: 1,
      projects: 2,
    });

    expect(consoleError).toHaveBeenCalledWith("[sitemap] sync failed", {
      error: expect.any(Error),
      projectId: "project_1",
    });
  });

  it("prunes sitemap snapshots older than 90 days after all-project sync", async () => {
    mocks.prisma.project.findMany.mockResolvedValue([]);
    mocks.prisma.sitemapSnapshot.deleteMany.mockResolvedValue({ count: 7 });

    await expect(syncSitemapForAllProjects(now)).resolves.toMatchObject({ pruned: 7 });

    expect(mocks.prisma.project.findMany).toHaveBeenCalledWith({
      select: { id: true },
      where: { domain: { not: "" }, syncPauses: { none: { kind: "sitemap_fetch" } } },
    });

    const where = mocks.prisma.sitemapSnapshot.deleteMany.mock.calls[0]?.[0]?.where;
    expect(where.fetchedAt.lt.toISOString()).toBe("2026-04-05T04:45:00.000Z");
  });
  it("keeps observed counts and stored duplicate entries consistent on an unchanged read", async () => {
    const entries = [{ loc: "https://example.com/a" }, { loc: "https://example.com/a" }];
    const { contentHash } = await import("./snapshot");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => xmlResponse(urlset(entries.map((entry) => entry.loc)))),
    );
    mocks.prisma.project.findFirst.mockResolvedValue({
      id: "project_1",
      domain: "example.com",
      syncPauses: [],
    });
    mocks.prisma.sitemapSnapshot.findFirst.mockResolvedValue({
      id: "old",
      entries: entries.slice(0, 1),
      contentHash: contentHash(entries),
    });
    await syncSitemapForProject("project_1", now);
    expect(mocks.prisma.sitemapSnapshot.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { fetchedAt: now, complete: true, urlCount: 2, entries } }),
    );
  });
});
