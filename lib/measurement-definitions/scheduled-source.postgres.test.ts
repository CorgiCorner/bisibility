import { makePublicId } from "@/lib/db/public-id";
import { expect, it, vi } from "vitest";
import { definitionDatabaseFixture } from "./postgres.test-fixture";
import { readDefinitionSource } from "./storage";

vi.mock("server-only", () => ({}));

it("parses a scheduled keyword source that still carries the database isDefault key", async () => {
  const f = await definitionDatabaseFixture();
  try {
    const projectId = f.project.project.id;
    const schedule = await f.db.checkSchedule.create({
      data: {
        enabled: true,
        frequency: "daily",
        isDefault: false,
        name: "Assigned schedule",
        projectId,
        publicId: makePublicId("sch"),
        serpDepth: 20,
        timeOfDay: "06:00",
        timezone: "Europe/Warsaw",
      },
    });
    await f.db.keyword.update({
      where: { id: f.observation.keyword.id },
      data: { checkScheduleId: schedule.id },
    });
    const emitted = await f.client.query<{ schedule: { id: string; isDefault: boolean } }>(
      `SELECT measurement_definition_source($1,$2)#> '{policy,checkSchedule}' AS schedule`,
      [projectId, f.observation.keyword.id],
    );
    expect(emitted.rows[0]?.schedule).toMatchObject({ id: schedule.id, isDefault: false });
    const source = await f.db.$transaction((tx) =>
      readDefinitionSource(tx, projectId, f.observation.keyword.id),
    );
    expect(source.policy.checkSchedule).toMatchObject({
      id: schedule.id,
      isDefault: false,
      projectId,
      publicId: schedule.publicId,
    });
  } finally {
    await f.close();
  }
}, 180_000);
