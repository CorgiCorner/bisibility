import { prisma } from "../db/prisma";
import {
  type MigrationReadinessOutput,
  migrationReadinessFailure,
  migrationReadinessOutput,
  migrationReadinessReport,
} from "./migration-readiness-check";

// Deploy preflight entry point. It ships inside the worker image so the host
// can ask the NEW image whether the target database is ready for it:
//
//   docker compose run --rm --no-deps worker \
//     node --experimental-transform-types \
//     --import ./lib/temporal/register-loader.mjs \
//     lib/temporal/migration-readiness-entrypoint.ts
//
// Exit 0 means the database has every bundled migration. Exit 1 names the
// pending migrations and must abort the deployment before the running worker
// is replaced. It fails closed, and never prints database connection details.
//
// The decisions live in migration-readiness-check.ts as pure functions; this
// file only performs the effects, so the exit path is unit tested.

let output: MigrationReadinessOutput;
try {
  output = migrationReadinessOutput(await migrationReadinessReport());
} catch (error) {
  output = migrationReadinessFailure(error);
} finally {
  // Release the connection pool so nothing keeps the event loop alive once the
  // report is written. A disconnect failure must not replace the report.
  await prisma.$disconnect().catch(() => undefined);
}

for (const line of output.stdout) console.log(line);
for (const line of output.stderr) console.error(line);

// `process.exit()` would truncate the pending list: writes to a piped stdout or
// stderr are asynchronous. Setting the code lets Node exit once they flush.
process.exitCode = output.exitCode;
