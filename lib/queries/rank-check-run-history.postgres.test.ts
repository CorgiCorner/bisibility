import { makePublicId } from "@/lib/db/public-id";
import { rankReportTestDatabase } from "@/lib/rank-reports/postgres-test-fixture";
import { afterEach, beforeEach, expect, it } from "vitest";
import { findHistoryRunRows } from "./rank-check-run-history";

let fixture: Awaited<ReturnType<typeof rankReportTestDatabase>> | null = null;
beforeEach(async () => {
  fixture = await rankReportTestDatabase();
}, 120_000);
afterEach(async () => {
  if (fixture) {
    await fixture.close();
    fixture = null;
  }
});
function database() {
  if (!fixture) throw new Error("Owned full-schema fixture is unavailable");
  return fixture;
}
async function createRun(
  projectId: string,
  status: string,
  index: number,
  extra: { deletedAt?: Date; launchedAt?: Date; finishedAt?: Date } = {},
) {
  return database().db.rankCheckRun.create({
    data: {
      projectId,
      publicId: makePublicId("rcr"),
      trigger: "manual",
      selectionKind: "single",
      selectionHash: `fixture-${index}`,
      selectionSpec: {},
      status,
      outcome: status === "completed" ? "deferred" : null,
      createdAt: new Date(Date.UTC(2026, 9, 12, 10, 0, index)),
      ...extra,
    },
  });
}
it("pages unlaunched cancelled and blocked runs with no check rows, without cross-project rows", async () => {
  const { db, project } = database();
  const statuses = ["blocked", "cancelled", "completed", "queued"];
  const created = [];
  for (let index = 0; index < 53; index++)
    created.push(await createRun(project.id, statuses[index % statuses.length], index));
  await createRun(project.id, "cancelled", 90, { deletedAt: new Date("2026-10-12T11:00:00Z") });
  const foreign = await db.project.create({
    data: { name: "Foreign", ownerId: project.ownerId, publicId: makePublicId("prj") },
  });
  await createRun(foreign.id, "blocked", 99);
  const first = await findHistoryRunRows(project.id, undefined, null, 25, true, db);
  const ids = first.map(({ publicId }) => publicId);
  let last = first.at(-1);
  while (last) {
    const page = await findHistoryRunRows(
      project.id,
      undefined,
      { id: last.publicId, timestamp: last.createdAt },
      25,
      true,
      db,
    );
    ids.push(...page.map(({ publicId }) => publicId));
    last = page.at(-1);
  }
  expect(ids).toHaveLength(53);
  expect(new Set(ids).size).toBe(53);
  expect(ids).toEqual(created.reverse().map(({ publicId }) => publicId));
  expect(first.some(({ status }) => status === "blocked")).toBe(true);
  expect(
    first.some(({ status, outcome }) => status === "completed" && outcome === "deferred"),
  ).toBe(true);
  expect(first.every(({ launchedAt, _count }) => launchedAt === null && _count.items === 0)).toBe(
    true,
  );
  expect(await db.rankCheck.count({ where: { runId: { in: created.map(({ id }) => id) } } })).toBe(
    0,
  );
});
it("retains the app history filter while the API explicitly includes unlaunched blocked runs", async () => {
  const { db, project } = database();
  const blocked = await createRun(project.id, "blocked", 1);
  const completed = await createRun(project.id, "completed", 2, {
    launchedAt: new Date("2026-10-12T10:00:00Z"),
  });
  const cancelled = await createRun(project.id, "cancelled", 3, {
    finishedAt: new Date("2026-10-12T10:01:00Z"),
  });
  const app = await findHistoryRunRows(project.id, undefined, null, 25, false, db);
  expect(new Set(app.map(({ publicId }) => publicId))).toEqual(
    new Set([completed.publicId, cancelled.publicId]),
  );
  const api = await findHistoryRunRows(project.id, ["blocked"], null, 25, true, db);
  expect(api.map(({ publicId }) => publicId)).toEqual([blocked.publicId]);
});
