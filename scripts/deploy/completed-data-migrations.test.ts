import { dataMigrationManifest } from "@/lib/data-migrations/manifest";
import { expect, test, vi } from "vitest";
import { readCompletedDataMigrations } from "./completed-data-migrations";

test("only a completed import with the bundled checksum releases its schema contract", async () => {
  const [complete, incomplete, changed] = dataMigrationManifest;
  const query = vi.fn()
    .mockResolvedValueOnce({ rows: [{ present: true }] })
    .mockResolvedValueOnce({ rows: [
      { ...complete, finishedAt: new Date() },
      { ...incomplete, finishedAt: null },
      { ...changed, checksum: "different", finishedAt: new Date() },
    ] });
  expect(await readCompletedDataMigrations({ query })).toEqual(new Set([complete.id]));
});

test("an empty database releases no schema contracts", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [{ present: false }] });
  expect(await readCompletedDataMigrations({ query })).toEqual(new Set());
  expect(query).toHaveBeenCalledTimes(1);
});
