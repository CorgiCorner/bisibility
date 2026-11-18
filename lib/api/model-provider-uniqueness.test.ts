import { createHarness } from "@/lib/model-playground/store.postgres.test-support";
import { expect, it } from "vitest";

const { db } = createHarness();
it("keeps the database's one provider connection per project constraint for native models", async () => {
  const insert = (project: string, id: string) =>
    db.query(
      'INSERT INTO provider_connections(id,"publicId","projectId",provider,kind) VALUES($1,$2,$3,$4,$5)',
      [id, id, project, "openrouter", "model"],
    );
  await expect(insert("project-a", "duplicate")).rejects.toMatchObject({
    code: "23505",
    constraint: "provider_connections_projectId_provider_key",
  });
  await db.query("INSERT INTO projects VALUES($1)", ["project-c"]);
  await expect(insert("project-c", "independent")).resolves.toBeDefined();
  expect(
    (
      await db.query('SELECT id FROM provider_connections WHERE "projectId"=$1 AND provider=$2', [
        "project-a",
        "openrouter",
      ])
    ).rows,
  ).toHaveLength(1);
});
