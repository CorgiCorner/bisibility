import { randomUUID } from "node:crypto";
import { makePublicId, PUBLIC_ID_RESOURCE_REGISTRY } from "@/lib/db/public-id-resources";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  type BusinessPgFixture,
  businessLocationDatabase,
  seedBusinessProject,
} from "./postgres.test-fixture";

describe("business-location public IDs against the complete shipped PostgreSQL schema", () => {
  let fixture: BusinessPgFixture;
  let scope: Awaited<ReturnType<typeof seedBusinessProject>>;
  beforeAll(async () => {
    fixture = await businessLocationDatabase();
  }, 120_000);
  beforeEach(async () => {
    scope = await seedBusinessProject(fixture);
  });
  afterAll(async () => {
    await fixture?.close();
  });

  const insert = (publicId: string) =>
    fixture.client.query<{ publicId: string; id: string }>(
      `INSERT INTO business_locations (id, "publicId", "projectId", role, state, "updatedAt")
     VALUES ($1, $2, $3, 'subject', 'active', CURRENT_TIMESTAMP)
     RETURNING id, "publicId"`,
      [randomUUID(), publicId, scope.project.id],
    );
  const refusal = { code: "23514", constraint: "business_locations_public_id_contract_format" };

  it("accepts the generated ID for the registered business-location resource", async () => {
    expect(PUBLIC_ID_RESOURCE_REGISTRY.biz).toBe("businessLocation");
    const publicId = makePublicId("biz");
    expect((await insert(publicId)).rows[0]?.publicId).toBe(publicId);
  });

  it("rejects a malformed ID at the database write boundary", async () => {
    await expect(insert("invalid")).rejects.toMatchObject(refusal);
  });

  it("rejects a valid ID belonging to a different resource", async () => {
    await expect(insert(makePublicId("prj"))).rejects.toMatchObject(refusal);
  });

  it("rejects changing a retained valid business ID to a foreign resource", async () => {
    const row = (await insert(makePublicId("biz"))).rows[0];
    await expect(
      fixture.client.query('UPDATE business_locations SET "publicId"=$1 WHERE id=$2', [
        makePublicId("prj"),
        row.id,
      ]),
    ).rejects.toMatchObject(refusal);
  });
});
