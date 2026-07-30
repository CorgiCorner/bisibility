#!/usr/bin/env node
import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const railway = JSON.parse(readFileSync("railway.json", "utf8"));
const railwayWorker = JSON.parse(readFileSync("deploy/railway-worker.json", "utf8"));
const dockerfile = readFileSync("Dockerfile", "utf8");
const workerDockerfile = readFileSync("Dockerfile.worker", "utf8");
const nodeVersion = readFileSync(".nvmrc", "utf8").trim().replace(/^v/, "");
const compose = readFileSync("docker-compose.yml", "utf8");
const alertRemediationSmoke = readFileSync("scripts/smoke/smoke-alert-remediation.mjs", "utf8");
const instrumentation = readFileSync("instrumentation.ts", "utf8");
const health = readFileSync("lib/api/discovery.ts", "utf8");
const temporalWorker = readFileSync("lib/temporal/worker.ts", "utf8");
const deployMigration = readFileSync("scripts/deploy/migrate.ts", "utf8");
const writeGateMigration = readFileSync(
  "prisma/migrations/20260729210500_public_id_v3_write_gate/migration.sql",
  "utf8",
);
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const migrationRunner = "npm run db:migrate";
const migrationScript =
  "node --experimental-transform-types --import ./lib/temporal/register-loader.mjs scripts/deploy/migrate.ts";
assert(packageJson.scripts?.["db:migrate"] === migrationScript, "db:migrate must use the generic migration runner");
assert(
  deployMigration.indexOf("migrationWriteGateContext()") <
    deployMigration.indexOf("await runMigrationPipeline"),
  "db:migrate must establish the fail-closed write-gate context before applying schema changes",
);
assert(
  deployMigration.indexOf("const beforePrisma = await pipeline.reblock(context, true)") <
    deployMigration.indexOf("await pipeline.prisma()"),
  "db:migrate must reblock or validate a recoverable fresh gate before applying N+1 schema changes",
);
assert(
  deployMigration.indexOf("await pipeline.prisma()") <
    deployMigration.indexOf("const afterPrisma = await pipeline.reblock(context, true)"),
  "db:migrate must recheck and retarget the write gate after Prisma",
);
assert(
  deployMigration.indexOf("const afterPrisma = await pipeline.reblock(context, true)") <
    deployMigration.indexOf("await pipeline.runData()"),
  "db:migrate must apply schema changes before running the retired data-migration registry",
);
assert(
  deployMigration.indexOf("await pipeline.runData()") <
    deployMigration.indexOf("await pipeline.cleanup(context)"),
  "db:migrate must clean automatic N+1 artifacts only after final migration readiness",
);
assert(
  writeGateMigration.includes("'automatic'") &&
    writeGateMigration.includes("'0000000000000000000000000000000000000000'") &&
    writeGateMigration.includes('"writesBlocked"') &&
    !writeGateMigration.includes("current_setting('bisibility.public_id_write_gate_policy'"),
  "The schema migration must install a neutral blocked gate for post-Prisma retargeting",
);
assert(
  deployMigration.includes('"migrate-cli", "node_modules", "prisma"'),
  "The generic wrapper must support the final runner image Prisma closure",
);
assert(
  !deployMigration.includes("blocksSchemaMigration") &&
    !deployMigration.includes("applyPrismaMigrationsThrough"),
  "The generic wrapper must not cap or emulate the Prisma migration tree",
);
assert(railway.build?.dockerfilePath === "Dockerfile", "Railway web must use Dockerfile");
assert(
  railway.deploy?.preDeployCommand?.includes(migrationRunner),
  "Railway web must run the coordinated migration runner",
);
assert(
  railwayWorker.build?.dockerfilePath === "Dockerfile.worker",
  "Railway worker must use Dockerfile.worker",
);
assert(
  [...dockerfile.matchAll(/^FROM node:([^\s]+)/gm)].every((match) =>
    match[1].startsWith(`${nodeVersion}-`),
  ),
  "Every application Docker stage must pin the exact .nvmrc Node version",
);
assert(
  workerDockerfile.includes(`FROM node:${nodeVersion}-slim`),
  "Worker Docker image must pin the exact .nvmrc Node version",
);
assert(
  dockerfile.includes("scripts/deploy/migrate.ts") &&
    dockerfile.includes("scripts/data-migrations") &&
    dockerfile.includes("scripts/ops/public-id-write-gate.ts") &&
    dockerfile.includes("scripts/ops/public-id-v3-contract-cleanup.ts") &&
    dockerfile.includes("/workspace/package.json ./package.json"),
  "Final Docker runner must package the migration runner, registry, and public ID write-gate command",
);
assert(dockerfile.includes('CMD ["npm", "run", "db:migrate"]'), "Docker migrate target must run db:migrate");
for (const dependency of ["@paralleldrive/cuid2", "@noble/hashes", "bignumber.js", "error-causes"]) {
  assert(
    dockerfile.includes(dependency),
    `Final Docker runner must package the ${dependency} public ID dependency closure`,
  );
}
assert(compose.includes(migrationRunner), "Compose must run the coordinated migration runner");
assert(
  alertRemediationSmoke.includes('"npm", ["run", "db:migrate"]'),
  "Alert remediation smoke must run the coordinated migration runner",
);
assert(
  alertRemediationSmoke.includes('DEPLOYMENT_ENV: "test"'),
  "Alert remediation smoke must use the explicit test write-gate context",
);
assert(
  instrumentation.includes("enforceMigrationsAtStartup"),
  "Node startup must fail closed when blocking migrations are incomplete",
);
assert(
  health.includes("readMigrationReadiness") &&
    health.includes('migrations !== "ready"'),
  "Health readiness must fail when blocking migrations are incomplete",
);
assert(
  temporalWorker.includes('from "./worker-write-gate"') &&
    temporalWorker.indexOf("await assertPublicIdV3WriteGateAllowsWorkerStartup()") <
      temporalWorker.indexOf("await assertMigrationsReady()"),
  "Temporal worker startup must refuse an active public ID write gate before other startup work",
);
assert(
  temporalWorker.includes('from "../data-migrations/readiness"') &&
    temporalWorker.indexOf("await assertMigrationsReady()") <
      temporalWorker.indexOf("await enforceWorkerSchemaGuard()"),
  "Temporal worker startup must require blocking data migrations before its schema guard",
);

const flyWeb = readFileSync("deploy/fly.web.toml", "utf8");
const flyWorker = readFileSync("deploy/fly.worker.toml", "utf8");
assert(flyWeb.includes(`dockerfile = "../Dockerfile"`), "Fly web must use the repository-root Dockerfile (path is relative to the config file)");
assert(flyWeb.includes(migrationRunner), "Fly web must run the coordinated migration runner");
assert(
  flyWeb.includes('release_command_timeout = "30m"'),
  "Fly web must allow blocking data migrations to exceed the five-minute default",
);
assert(flyWeb.includes('path = "/api/v1/health"'), "Fly web health check is missing");
assert(flyWorker.includes(`dockerfile = "../Dockerfile.worker"`), "Fly worker must use the repository-root Dockerfile.worker (path is relative to the config file)");
assert(flyWorker.includes('[[restart]]'), "Fly worker restart policy is missing");
assert(flyWorker.includes('policy = "on-failure"'), "Fly worker must restart on failure");
assert(flyWorker.includes("retries = 50"), "Fly worker restart budget must cover Temporal startup");

console.log("Deployment manifests are structurally valid.");
