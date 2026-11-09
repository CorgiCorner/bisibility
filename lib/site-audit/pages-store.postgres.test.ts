import { makePublicId } from "@/lib/db/public-id-resources";
import { closeoutPostgresFixture } from "@/lib/metering/history-closeout/postgres.test-fixture";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { auditPageEvidence } from "./page-evidence";
import { createCrawlStore, urlHash } from "./pages-store";
import type { SiteAuditPage } from "./schema";

const fixtureState = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return fixtureState.db;
  },
}));

import { failSiteAuditActivity } from "@/lib/temporal/site-audit-activities";
import { cancelSiteAuditRun, createSiteAuditRun, resumeSiteAuditRun } from "./runs";
import { listSiteAudits, readSiteAudit } from "./service";

const page: SiteAuditPage = {
  url: "https://example.com/",
  finalUrl: "https://example.com/",
  status: 200,
  responseTimeMs: 1,
  title: "Example",
  description: null,
  canonical: null,
  headings: [],
  h1Count: 0,
  indexable: true,
  robots: null,
  internalLinkCount: 1,
  externalLinkCount: 0,
  internalLinks: ["https://example.com/next"],
  imageCount: 0,
  missingAltCount: 0,
  issues: [],
};

describe("site audit persisted page fencing", () => {
  let fixture: Awaited<ReturnType<typeof closeoutPostgresFixture>>;
  beforeAll(async () => {
    fixture = await closeoutPostgresFixture({ schemaOnly: true });
    fixtureState.db = fixture.db;
  }, 180_000);
  afterAll(async () => {
    await fixture?.close();
  });
  async function createRun() {
    const report = await fixture.db.agentReport.create({
      data: {
        projectId: "normal",
        publicId: makePublicId("agr"),
        kind: "site_audit",
        title: "Audit",
        body: {},
        provenance: {},
      },
    });
    const run = await fixture.db.siteAuditRun.create({
      data: {
        publicId: report.publicId,
        projectId: "normal",
        reportId: report.id,
        target: page.url,
        requestedPages: 15,
        budgetPages: 15,
        frontier: { create: { url: page.url, urlHash: urlHash(page.url), depth: 0 } },
      },
    });
    return { run, store: createCrawlStore(fixture.db) };
  }
  it("commits the page and frontier once even if the activity replays", async () => {
    const { run, store } = await createRun();
    const claim = await store.claim(run.id);
    if (!("token" in claim)) throw new Error("run was not claimed");
    const entry = { url: page.url, depth: 0 };
    expect(
      await store.save({
        claim,
        entry,
        page,
        discovered: ["https://example.com/next"],
        requests: 1,
      }),
    ).toBe(true);
    expect(
      await store.save({
        claim,
        entry,
        page,
        discovered: ["https://example.com/next"],
        requests: 1,
      }),
    ).toBe(false);
    expect(
      await fixture.db.siteAuditRun.findUniqueOrThrow({ where: { id: run.id } }),
    ).toMatchObject({ pagesCrawled: 1, requests: 1 });
    expect(await fixture.db.siteAuditPage.count({ where: { runId: run.id } })).toBe(1);
    expect(await store.next(claim)).toMatchObject({ url: "https://example.com/next" });
    const next = {
      ...page,
      url: "https://example.com/next",
      finalUrl: "https://example.com/next",
      indexable: false,
      issues: [
        { code: "missing_title", severity: "warning" as const, message: "Title is missing." },
      ],
    };
    expect(
      await store.save({
        claim,
        entry: { url: next.url, depth: 1 },
        page: next,
        discovered: [],
        requests: 1,
      }),
    ).toBe(true);
    const evidence = await auditPageEvidence(fixture.db, run.id);
    expect(evidence.pages.map((item) => item.url)).toEqual([page.url, next.url]);
    expect(evidence.totals).toMatchObject({
      pages: 2,
      warnings: 1,
      errors: 0,
      indexable: 1,
      unavailable: 0,
    });
  });
  it.each(["cancelled", "stale lease"])("rejects writes for %s", async (condition) => {
    const { run, store } = await createRun();
    const claim = await store.claim(run.id);
    if (!("token" in claim)) throw new Error("run was not claimed");
    await fixture.db.siteAuditRun.update({
      where: { id: run.id },
      data: condition === "cancelled" ? { state: "cancelled" } : { leaseToken: "new-owner" },
    });
    expect(
      await store.save({
        claim,
        entry: { url: page.url, depth: 0 },
        page,
        discovered: [],
        requests: 1,
      }),
    ).toBe(false);
    expect(await fixture.db.siteAuditPage.count({ where: { runId: run.id } })).toBe(0);
  });
  it("reads the committed count after acquiring a lease", async () => {
    const { run, store } = await createRun();
    await fixture.db.siteAuditRun.update({ where: { id: run.id }, data: { pagesCrawled: 14 } });
    const spy = vi.spyOn(fixture.db.siteAuditRun, "findUniqueOrThrow").mockResolvedValueOnce(run);
    try {
      expect(await store.claim(run.id)).toMatchObject({ pagesCrawled: 14 });
    } finally {
      spy.mockRestore();
    }
  });
  it("never commits a page beyond the resolved budget", async () => {
    const { run, store } = await createRun();
    const claim = await store.claim(run.id);
    if (!("token" in claim)) throw new Error("run was not claimed");
    await store.limit(claim, { maxPages: 0, priority: 0, stopReason: "page_budget" });
    expect(
      await store.save({
        claim,
        entry: { url: page.url, depth: 0 },
        page,
        discovered: [],
        requests: 1,
      }),
    ).toBe(false);
    expect(await fixture.db.siteAuditPage.count({ where: { runId: run.id } })).toBe(0);
    expect(await store.next(claim)).toMatchObject({ url: page.url });
  });
  it("marks canonical destinations visited and preserves broken-link warnings in the saved report", async () => {
    const { run, store } = await createRun();
    const claim = await store.claim(run.id);
    if (!("token" in claim)) throw new Error("run was not claimed");
    const destination = "https://www.example.com/";
    const missing = "https://www.example.com/missing";
    await store.save({
      claim,
      entry: { url: page.url, depth: 0 },
      page: { ...page, finalUrl: destination, internalLinks: [missing] },
      discovered: [destination, missing],
      requests: 1,
    });
    expect(await store.next(claim)).toMatchObject({ url: missing });
    await store.save({
      claim,
      entry: { url: missing, depth: 1 },
      page: { ...page, url: missing, finalUrl: missing, status: 404 },
      discovered: [],
      requests: 1,
    });
    await store.finish(claim, "finished", 0);
    const report = await fixture.db.agentReport.findUniqueOrThrow({ where: { id: run.reportId } });
    expect(report.body).toMatchObject({
      summary: { pages: 2, warnings: 1 },
      pages: [
        expect.objectContaining({
          issues: [expect.objectContaining({ code: "broken_internal_link" })],
        }),
        expect.anything(),
      ],
    });
    expect(await listSiteAudits("normal")).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: run.publicId, kind: "site_audit" })]),
    );
    expect(await readSiteAudit("normal", run.publicId)).toMatchObject({
      id: run.publicId,
      result: { summary: { pages: 2, warnings: 1 } },
    });
    expect(await readSiteAudit("rollback", run.publicId)).toBeNull();
  });
  it.each(["cancel", "fail"])("retains saved report pages after %s", async (operation) => {
    const { run, store } = await createRun();
    const claim = await store.claim(run.id);
    if (!("token" in claim)) throw new Error("run was not claimed");
    await store.save({
      claim,
      entry: { url: page.url, depth: 0 },
      page,
      discovered: [],
      requests: 1,
    });
    if (operation === "cancel") await cancelSiteAuditRun("normal", run.publicId, { actorId: null });
    else await failSiteAuditActivity({ runId: run.id, generation: 0 });
    const report = await fixture.db.agentReport.findUniqueOrThrow({ where: { id: run.reportId } });
    expect(report.body).toMatchObject({
      state: "partial",
      summary: { pages: 1 },
      pages: [expect.objectContaining({ url: page.url })],
    });
  });
  it("does not let a previous workflow generation fail a resumed run", async () => {
    const { run } = await createRun();
    await fixture.db.siteAuditRun.update({
      where: { id: run.id },
      data: { generation: 1, state: "running", leaseToken: "new-worker" },
    });
    await failSiteAuditActivity({ runId: run.id, generation: 0 });
    expect(
      await fixture.db.siteAuditRun.findUniqueOrThrow({ where: { id: run.id } }),
    ).toMatchObject({
      generation: 1,
      state: "running",
      leaseToken: "new-worker",
      stopReason: null,
    });
  });
  it("releases only an owned lease and preserves crash-expiry recovery", async () => {
    const { run, store } = await createRun();
    const claim = await store.claim(run.id);
    if (!("token" in claim)) throw new Error("run was not claimed");
    await store.release(claim);
    const replacement = await store.claim(run.id);
    if (!("token" in replacement)) throw new Error("run was not reclaimed");
    await store.release(claim);
    expect(
      await fixture.db.siteAuditRun.findUniqueOrThrow({ where: { id: run.id } }),
    ).toMatchObject({ leaseToken: replacement.token });
    await fixture.db.siteAuditRun.update({
      where: { id: run.id },
      data: { leaseExpiresAt: new Date(0) },
    });
    const recovered = await store.claim(run.id);
    expect(recovered).toHaveProperty("token");
    expect(recovered).not.toHaveProperty("token", replacement.token);
  });
  it("reads a long-domain worker report before and after completion", async () => {
    const domain = ["a".repeat(63), "b".repeat(63), "c".repeat(63), "d".repeat(57), "com"].join(
      ".",
    );
    const saved = await createSiteAuditRun({
      projectId: "normal",
      actorId: null,
      domain,
      target: `https://${domain}/`,
      requestedPages: 15,
    });
    expect(await readSiteAudit("normal", saved.id)).toMatchObject({
      result: { target: `https://${domain}/` },
      run: { state: "queued" },
    });
    const run = await fixture.db.siteAuditRun.findUniqueOrThrow({ where: { publicId: saved.id } });
    const store = createCrawlStore(fixture.db);
    const claim = await store.claim(run.id);
    if (!("token" in claim)) throw new Error("run was not claimed");
    await store.finish(claim, "finished", 0);
    expect(await readSiteAudit("normal", saved.id)).toMatchObject({
      result: { target: `https://${domain}/` },
      run: { state: "complete" },
    });
  });
  it("audits cancel and resume once each and rolls back when audit insertion fails", async () => {
    vi.stubEnv("SCHEDULER_DRIVER", "temporal");
    await fixture.db.instanceSetting.upsert({
      where: { key: "siteAudit.worker" },
      create: { key: "siteAudit.worker", value: "1" },
      update: { value: "1" },
    });
    const { run } = await createRun();
    const actor = { actorId: null, credentialId: "fixture-key", credentialKind: "project_key" };
    await expect(
      cancelSiteAuditRun("normal", run.publicId, { actorId: "missing-user" }),
    ).rejects.toThrow();
    expect(
      await fixture.db.siteAuditRun.findUniqueOrThrow({ where: { id: run.id } }),
    ).toMatchObject({ state: "queued", generation: 0 });
    await cancelSiteAuditRun("normal", run.publicId, actor);
    await cancelSiteAuditRun("normal", run.publicId, actor);
    await resumeSiteAuditRun("normal", run.publicId, actor);
    await resumeSiteAuditRun("normal", run.publicId, actor);
    const events = await fixture.db.auditLog.findMany({
      where: { targetId: run.publicId },
      orderBy: { action: "asc" },
    });
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      action: "site_audit.cancel",
      before: { state: "queued", generation: 0 },
      after: {
        state: "cancelled",
        generation: 0,
        credentialId: "fixture-key",
        credentialKind: "project_key",
      },
    });
    expect(events[1]).toMatchObject({
      action: "site_audit.resume",
      before: { state: "cancelled", generation: 0 },
      after: {
        state: "queued",
        generation: 1,
        credentialId: "fixture-key",
        credentialKind: "project_key",
      },
    });
    vi.unstubAllEnvs();
  });
});
