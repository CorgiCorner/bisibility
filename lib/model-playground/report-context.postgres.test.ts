import { expect, test, vi } from "vitest";
import { historyHarness } from "./history.test-support";
import { finalizeModelPlaygroundReport } from "./report-finalize";

const shared = vi.hoisted(() => ({
  database: null as import("./store-db").ModelPlaygroundDatabase | null,
}));
vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: async () => ({ id: "actor-a" }),
  requireProjectScope: async () => ({ id: "project-a" }),
}));
vi.mock("./database", () => ({
  modelPlaygroundDatabase: {
    $transaction: (
      work: Parameters<import("./store-db").ModelPlaygroundDatabase["$transaction"]>[0],
    ) => {
      if (!shared.database) throw new Error("Wrong database");
      return shared.database.$transaction(work);
    },
  },
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get() {
        throw new Error("Global context database used");
      },
    },
  ),
}));

import { saveModelPlaygroundReportAction } from "@/lib/actions/research-history";

const h = historyHarness();
test("finalisation reads the run and brand context exclusively from its supplied database", async () => {
  shared.database = h.database;
  const run = await h.launch();
  const actionRun = await h.launch();
  await h.db.exec(`ALTER TABLE projects ADD COLUMN "publicId" text, ADD COLUMN name text, ADD COLUMN domain text,
    ADD COLUMN "brandAliases" text[] DEFAULT '{}', ADD COLUMN "brandExcludedNames" text[] DEFAULT '{}';
    UPDATE projects SET "publicId"='prj_aaaaaaaaaaaaaaaaaaaaaaaa',name='Fixture',domain='fixture.invalid';
    CREATE TABLE competitors("publicId" text,label text,domain text,aliases text[],"excludedNames" text[],"projectId" text);
    INSERT INTO competitors VALUES('cmp_aaaaaaaaaaaaaaaaaaaaaaaa',NULL,'other.invalid','{}','{}','project-a');`);
  expect(
    (await saveModelPlaygroundReportAction({ projectRef: "project-a", runId: actionRun.id })).ok,
  ).toBe(true);
  expect((await finalizeModelPlaygroundReport(run.id, h.database)).ok).toBe(true);
  const report = (
    await h.db.query<{ body: { entities: unknown[] } }>(`SELECT body FROM agent_reports`)
  ).rows[0];
  const reports = (
    await h.db.query<{ body: { entities: unknown[] } }>(`SELECT body FROM agent_reports`)
  ).rows;
  expect(reports).toHaveLength(2);
  expect(reports[0].body.entities).toEqual(reports[1].body.entities);
  expect(report.body.entities).toMatchObject([
    { label: "Fixture", kind: "project" },
    { label: "other.invalid", kind: "competitor" },
  ]);
});
