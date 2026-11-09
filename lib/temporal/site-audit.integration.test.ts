import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { makePublicId } from "@/lib/db/public-id-resources";
import { closeoutPostgresFixture } from "@/lib/metering/history-closeout/postgres.test-fixture";
import { crawlSiteAuditBatch } from "@/lib/site-audit/batch";
import { createCrawlStore, urlHash } from "@/lib/site-audit/pages-store";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe.runIf(process.env.SITE_AUDIT_TEMPORAL_TEST === "1")(
  "site audit owned Temporal fixture",
  () => {
    let fixture: Awaited<ReturnType<typeof closeoutPostgresFixture>>;
    let temporal: TestWorkflowEnvironment;
    let server: Server;
    let origin: string;
    const requests: string[] = [];

    beforeAll(async () => {
      vi.useRealTimers();
      fixture = await closeoutPostgresFixture({ schemaOnly: true });
      server = createServer((request, response) => {
        const path = request.url ?? "/";
        requests.push(path);
        if (path === "/robots.txt") {
          response.writeHead(200);
          response.end("User-agent: *\nAllow: /");
          return;
        }
        const page = Number(path.slice(1)) || 0;
        response.writeHead(200, { "content-type": "text/html" });
        setTimeout(
          () =>
            response.end(
              `<title>Page ${page}</title><h1>Page</h1>${page < 119 ? `<a href="/${page + 1}">Next</a>` : ""}`,
            ),
          15,
        );
      });
      await new Promise<void>((accept) => server.listen(0, "127.0.0.1", accept));
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("Fixture listener is not loopback TCP.");
      origin = `http://127.0.0.1:${address.port}`;
      const cli = process.env.SITE_AUDIT_TEMPORAL_CLI;
      temporal = await TestWorkflowEnvironment.createLocal({
        server: {
          ip: "127.0.0.1",
          ui: false,
          ...(cli ? { executable: { type: "existing-path", path: cli } } : {}),
        },
      });
    }, 600_000);
    afterAll(async () => {
      await temporal?.teardown();
      if (server?.listening)
        await new Promise<void>((accept, reject) =>
          server.close((error) => (error ? reject(error) : accept())),
        );
      await fixture?.close();
    }, 60_000);

    it("persists 120 pages across a worker restart and continues as new", async () => {
      const id = makePublicId("agr");
      const report = await fixture.db.agentReport.create({
        data: {
          projectId: "normal",
          publicId: id,
          kind: "site_audit",
          title: "Audit",
          body: {},
          provenance: {},
        },
      });
      const run = await fixture.db.siteAuditRun.create({
        data: {
          projectId: "normal",
          publicId: id,
          reportId: report.id,
          target: "https://example.com/",
          requestedPages: 120,
          budgetPages: 120,
          frontier: {
            create: {
              url: "https://example.com/",
              urlHash: urlHash("https://example.com/"),
              depth: 0,
            },
          },
        },
      });
      const taskQueue = `site-audit-fixture-${randomUUID()}`;
      const activities = {
        crawlSiteAuditBatchActivity: async () =>
          crawlSiteAuditBatch(run.id, {
            store: createCrawlStore(fixture.db),
            maxPages: 3,
            budget: async () => ({ maxPages: 120, stopReason: "page_budget", priority: 0 }),
            transport: {
              resolveHost: async () => [{ address: "93.184.216.34", family: 4 }],
              fetch: async (url, init) =>
                fetch(new URL(new URL(String(url)).pathname, origin), {
                  signal: init?.signal,
                  redirect: "manual",
                }),
            },
          }),
      };
      const workerOptions = {
        connection: temporal.nativeConnection,
        namespace: temporal.namespace,
        taskQueue,
        workflowsPath: resolve(process.cwd(), "lib/temporal/site-audit-workflows.ts"),
        activities,
      };
      const first = await Worker.create(workerOptions);
      const firstRun = first.run();
      const workflowId = `site-audit-fixture-${randomUUID()}`;
      const handle = await temporal.client.workflow.start("siteAuditCrawlWorkflow", {
        taskQueue,
        workflowId,
        args: [{ runId: run.id, generation: 0 }],
      });
      const deadline = Date.now() + 90_000;
      while ((await fixture.db.siteAuditPage.count({ where: { runId: run.id } })) < 9) {
        if (Date.now() >= deadline) throw new Error("Worker did not persist the first pages.");
        await new Promise((done) => setTimeout(done, 100));
      }
      first.shutdown();
      await firstRun;
      const persisted = await fixture.db.siteAuditPage.findMany({ where: { runId: run.id } });
      const second = await Worker.create(workerOptions);
      const result = await second.runUntil(() => handle.result());
      expect(result).toMatchObject({ state: "complete", pagesCrawled: 120 });
      for (const row of persisted) {
        const path = new URL((row.facts as { url: string }).url).pathname;
        expect(
          requests.filter((value) => value === path),
          path,
        ).toHaveLength(1);
      }
      const history = await temporal.client.workflow
        .getHandle(workflowId, handle.firstExecutionRunId)
        .fetchHistory();
      expect(
        history.events?.some((event) => event.workflowExecutionContinuedAsNewEventAttributes),
      ).toBe(true);
      const receipt = {
        events: history.events?.length ?? 0,
        bytes: Buffer.byteLength(JSON.stringify(history)),
        committedBeforeRestart: persisted.length,
      };
      console.info("site-audit first workflow history", receipt);
      if (process.env.SITE_AUDIT_TEMPORAL_TEST_RECEIPT)
        await writeFile(process.env.SITE_AUDIT_TEMPORAL_TEST_RECEIPT, JSON.stringify(receipt));
      expect(await fixture.db.siteAuditPage.count({ where: { runId: run.id } })).toBe(120);
    }, 240_000);
  },
);
