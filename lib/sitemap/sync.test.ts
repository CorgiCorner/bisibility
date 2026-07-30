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
        findFirst: vi.fn(),
      },
    },
    tx,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/signals/emit", () => ({ emitSignal: mocks.emitSignal }));

const now = new Date("2026-07-04T04:45:00.000Z");

function xmlResponse(body: string, status = 200, contentLength?: number) {
  return {
    headers: new Headers(
      contentLength === undefined ? {} : { "content-length": String(contentLength) },
    ),
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
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

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("stores a baseline snapshot without emitting a signal", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(xmlResponse(urlset(["https://example.com/"])));
    mocks.prisma.project.findFirst.mockResolvedValue({ domain: "example.com", id: "project_1" });
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
    vi.mocked(fetch).mockResolvedValue(xmlResponse(currentXml));
    mocks.prisma.project.findFirst.mockResolvedValue({ domain: "example.com", id: "project_1" });
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
    vi.mocked(fetch).mockResolvedValue(xmlResponse("<html><body>Not found</body></html>"));
    mocks.prisma.project.findFirst.mockResolvedValue({ domain: "example.com", id: "project_1" });

    await expect(syncSitemapForProject("project_1", now)).rejects.toThrow(
      "not a urlset or sitemapindex",
    );
    expect(mocks.emitSignal).not.toHaveBeenCalled();
    expect(mocks.prisma.sitemapSnapshot.create).not.toHaveBeenCalled();
  });

  it("skips a project whose sitemap monitor is disabled", async () => {
    mocks.prisma.project.findFirst.mockResolvedValue({
      domain: "example.com",
      id: "project_1",
      sitemapMonitoringEnabled: false,
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
    mocks.prisma.project.findFirst.mockResolvedValue({ domain: "example.com", id: "project_1" });

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
      .mockResolvedValueOnce(xmlResponse(urlset(["https://two.example/"])));
    mocks.prisma.project.findMany.mockResolvedValue([{ id: "project_1" }, { id: "project_2" }]);
    mocks.prisma.project.findFirst
      .mockResolvedValueOnce({ domain: "one.example", id: "project_1" })
      .mockResolvedValueOnce({ domain: "two.example", id: "project_2" });
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
      where: { domain: { not: "" }, sitemapMonitoringEnabled: true },
    });

    const where = mocks.prisma.sitemapSnapshot.deleteMany.mock.calls[0]?.[0]?.where;
    expect(where.fetchedAt.lt.toISOString()).toBe("2026-04-05T04:45:00.000Z");
  });
});
