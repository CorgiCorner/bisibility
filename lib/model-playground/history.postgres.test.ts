import { Prisma } from "@/lib/generated/prisma/client";
import { beforeEach, expect, it, vi } from "vitest";
import { input, result } from "./contract-fixtures.test-support";
import { historyHarness } from "./history.test-support";
import { buildModelPlaygroundReport } from "./report-body";

const mocks = vi.hoisted(() => ({ query: vi.fn(), reports: vi.fn(), pins: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: mocks.query,
    agentReport: { findMany: mocks.reports },
    researchHistoryPin: { findMany: mocks.pins },
    projectDefaults: { findUnique: async () => ({ timezone: "UTC" }) },
  },
}));

import { readModelPlaygroundHistory } from "@/lib/ai-research/model-playground-history";

const h = historyHarness();
beforeEach(() => {
  mocks.query.mockImplementation(async (sql, ...values) => {
    const query = Array.isArray(sql)
      ? Prisma.sql(sql as unknown as TemplateStringsArray, ...values)
      : sql;
    return (await h.db.query(query.text, query.values)).rows;
  });
  mocks.reports.mockImplementation(
    async ({ where, take }) =>
      (
        await h.db.query(
          `SELECT a.*,CASE WHEN r.id IS NULL THEN NULL ELSE json_build_object('id',r.id) END AS "modelPlaygroundRun" FROM agent_reports a LEFT JOIN model_playground_runs r ON r."reportId"=a.id AND r."projectId"=a."projectId" WHERE a."projectId"=$1 AND a.id=ANY($2::text[]) ORDER BY a."createdAt" DESC,a.id DESC LIMIT $3`,
          [where.projectId, where.id.in, take],
        )
      ).rows,
  );
  mocks.pins.mockImplementation(
    async ({ where }) =>
      (
        await h.db.query(
          `SELECT "itemKey" FROM research_history_pins WHERE "projectId"=$1 AND "userId"=$2 AND surface=$3 AND "itemKey"=ANY($4::text[])`,
          [where.projectId, where.userId, where.surface, where.itemKey.in],
        )
      ).rows,
  );
});
it("pages 125 mixed records with equal timestamps exactly once and isolates pins", async () => {
  const body = buildModelPlaygroundReport(crypto.randomUUID(), input(), [result()], []);
  for (let i = 0; i < 125; i++) {
    const id = `row-${String(i).padStart(3, "0")}`;
    const run = i % 2 ? await h.launch() : null;
    const content = run
      ? { ...body, runId: run.id }
      : { input: { prompt: `Legacy ${i}`, engines: ["claude"] }, result: { costCents: 12 } };
    await h.db.query(
      `INSERT INTO agent_reports(id,"publicId","projectId",kind,title,body,provenance,"createdAt") VALUES($1,$1,'project-a','prompt_explorer','Compare',$2::jsonb,$3::jsonb,'2026-11-11 12:00:00')`,
      [
        id,
        JSON.stringify(content),
        JSON.stringify(run ? { source: "model_playground", runId: run.id } : {}),
      ],
    );
    if (run) await h.store.attachReport("project-a", run.id, id);
  }
  await h.db.exec(
    `INSERT INTO research_history_pins VALUES('other-user','project-a','model_playground','row-124'),('user-a','project-b','model_playground','row-123'),('user-a','project-a','model_playground','row-122')`,
  );
  const keys: string[] = [];
  let cursor: string | null = null;
  do {
    const page = await readModelPlaygroundHistory("project-a", "user-a", {
      query: "",
      filters: [],
      cursor,
    });
    expect(page.total).toBe(125);
    expect(page.pinnedCount).toBe(1);
    for (const row of page.groups.flatMap((group) => group.rows)) {
      keys.push(row.key);
      expect(row.pinned).toBe(row.key === "row-122");
      if (row.meta.kind === "model" && row.key === "row-123") {
        expect(row.meta.engines).toEqual(["api:openrouter:vendor/text-model:version.1"]);
        expect(row.cost).toEqual({ kind: "unknown" });
      }
    }
    cursor = page.nextCursor;
  } while (cursor);
  expect(new Set(keys).size).toBe(125);
  expect(keys).toEqual([...keys].sort().reverse());
  const native = await readModelPlaygroundHistory("project-a", "user-a", {
    query: "",
    filters: [{ facet: "engine", value: "api:openrouter:vendor/text-model:version.1" }],
    cursor: null,
  });
  expect(native.total).toBe(62);
  expect(native.chips).toContainEqual({ facet: "engine", value: "claude" });
  const pinned = await readModelPlaygroundHistory("project-a", "user-a", {
    query: "",
    filters: [{ facet: "pinned", value: "1" }],
    cursor: null,
  });
  expect(pinned.groups.flatMap((group) => group.rows).map((row) => row.key)).toEqual(["row-122"]);
  const foreign = await readModelPlaygroundHistory("project-b", "user-a", {
    query: "",
    filters: [],
    cursor: null,
  });
  expect(foreign.total).toBe(0);
});

it("does not identify forged report bodies as native history or native filter matches", async () => {
  const run = await h.launch();
  const body = buildModelPlaygroundReport(run.id, input(), [result()], []);
  await h.db.query(
    `INSERT INTO agent_reports(id,"publicId","projectId",kind,title,body,provenance) VALUES('forged','forged','project-a','prompt_explorer','Forged',$1::jsonb,$2::jsonb)`,
    [JSON.stringify(body), JSON.stringify({ source: "model_playground", runId: run.id })],
  );
  const page = await readModelPlaygroundHistory("project-a", "user-a", {
    query: "",
    filters: [],
    cursor: null,
  });
  expect(page.groups[0].rows[0]).toMatchObject({
    meta: { engines: [] },
    cost: { kind: "unknown" },
  });
  const filtered = await readModelPlaygroundHistory("project-a", "user-a", {
    query: "",
    filters: [{ facet: "engine", value: "api:openrouter:vendor/text-model:version.1" }],
    cursor: null,
  });
  expect(filtered.total).toBe(0);
  await h.store.attachReport("project-a", run.id, "forged");
  expect(
    (
      await readModelPlaygroundHistory("project-a", "user-a", {
        query: "",
        filters: [{ facet: "engine", value: "api:openrouter:vendor/text-model:version.1" }],
        cursor: null,
      })
    ).total,
  ).toBe(1);
});
