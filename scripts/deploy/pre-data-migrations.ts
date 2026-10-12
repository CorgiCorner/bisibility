import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Prisma has no stop-at option; defer self-guarded contracts until data import finishes. */
export async function withPreDataMigrations<T>(
  projectRoot: string,
  run: (path: string) => Promise<T>,
  completed: ReadonlySet<string> = new Set(),
) {
  const source = join(projectRoot, "prisma", "migrations");
  const staging = await mkdtemp(join(tmpdir(), "pre-data-migrations-"));
  try {
    let deferred = false;
    for (const entry of (await readdir(source, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory()) {
        const sql = await readFile(join(source, entry.name, "migration.sql"), "utf8");
        const dependencies = [...sql.matchAll(/^-- after-data-migration:\s*(\S+)/gm)];
        deferred ||= dependencies.some((match) => !completed.has(match[1]));
        if (deferred) continue;
      }
      await cp(join(source, entry.name), join(staging, entry.name), { recursive: true });
    }
    return await run(staging);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
