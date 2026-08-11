#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { parse } from "yaml";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const railway = JSON.parse(readFileSync("railway.json", "utf8"));
const railwayWorker = JSON.parse(readFileSync("deploy/railway-worker.json", "utf8"));
const dockerfile = readFileSync("Dockerfile", "utf8");
const workerDockerfile = readFileSync("Dockerfile.worker", "utf8");
const nodeVersion = readFileSync(".nvmrc", "utf8").trim().replace(/^v/, "");
const compose = readFileSync("docker-compose.yml", "utf8");
const composeCore = readFileSync("compose.yaml", "utf8");
const composeWorker = readFileSync("compose.worker.yaml", "utf8");
const composeTemporal = readFileSync("compose.temporal.yaml", "utf8");
const composeBuild = readFileSync("compose.build.yaml", "utf8");
const alertRemediationSmoke = readFileSync("scripts/smoke/smoke-alert-remediation.mjs", "utf8");
const instrumentation = readFileSync("instrumentation.ts", "utf8");
const health = readFileSync("lib/api/discovery.ts", "utf8");
const temporalWorker = readFileSync("lib/temporal/worker.ts", "utf8");
const deployMigration = readFileSync("scripts/deploy/migrate.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
// The RUN may carry BuildKit flags such as a --mount cache; the guard is about what the
// closure installs, not how the layer is built.
const seedCliInstall =
  dockerfile.match(/RUN (?:--mount=\S+ )*npm install --prefix \/seed-cli[\s\S]*?(?=\nFROM )/)?.[0] ??
  "";
const migrationRunner = "npm run db:migrate";
const migrationScript =
  "node --experimental-transform-types --import ./lib/temporal/register-loader.mjs scripts/deploy/migrate.ts";
assert(packageJson.scripts?.["db:migrate"] === migrationScript, "db:migrate must use the generic migration runner");
assert(
  deployMigration.indexOf("await pipeline.prisma()") <
    deployMigration.indexOf("await pipeline.runData()"),
  "db:migrate must apply schema changes before running active data migrations",
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
  railway.deploy?.healthcheckPath === "/api/v1/readiness",
  "Railway web must use the readiness probe",
);
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
for (const [name, contents] of [
  ["application", dockerfile],
  ["worker", workerDockerfile],
]) {
  assert(
    contents.includes(
      "COPY scripts/generate/root-postinstall.mjs ./scripts/generate/root-postinstall.mjs",
    ),
    `${name} Docker dependency stage must include the root postinstall entrypoint`,
  );
}
assert(
  dockerfile.includes("scripts/deploy/migrate.ts") &&
    dockerfile.includes("scripts/data-migrations") &&
    dockerfile.includes("/workspace/package.json ./package.json"),
  "Final Docker runner must package the migration runner and data-migration registry",
);
assert(
  seedCliInstall.includes("@paralleldrive/cuid2@"),
  "The final Docker runner seed closure must include the public-ID generator",
);
assert(dockerfile.includes('CMD ["npm", "run", "db:migrate"]'), "Docker migrate target must run db:migrate");
assert(compose.includes(migrationRunner), "Compose must run the coordinated migration runner");
const composeEnv = {
  ...process.env,
  BETTER_AUTH_SECRET: "test-auth-secret",
  BETTER_AUTH_URL: "https://example.com",
  BISIBILITY_DEPLOYMENT_SUFFIX: "a1b2c3d4",
  BISIBILITY_SECRETS_KEY: "test-secrets-key",
  DATABASE_URL: "postgresql://bisibility:test@postgres:5432/bisibility",
  DIRECT_URL: "postgresql://bisibility:test@postgres:5432/bisibility",
  POSTGRES_PASSWORD: "test",
  SITE_URL: "https://example.com",
  TEMPORAL_ADDRESS: "temporal.example.com:7233",
  TEMPORAL_POSTGRES_PASSWORD: "temporal-test",
};
function renderCompose(files, environment = {}) {
  const result = spawnSync("docker", ["compose", ...files.flatMap((file) => ["-f", file]), "config"], {
    encoding: "utf8",
    env: { ...composeEnv, ...environment },
  });
  if (result.error?.code === "ENOENT") {
    throw new Error(
      "Deployment config validation requires the Docker CLI with the Compose plugin installed.",
    );
  }
  if (result.error || result.status !== 0) {
    throw new Error(
      `Compose config failed for ${files.join(", ")}: ${result.error?.message ?? result.stderr}`,
    );
  }
  return parse(result.stdout);
}
const coreConfig = renderCompose(["compose.yaml"]);
const workerConfig = renderCompose(["compose.yaml", "compose.worker.yaml"]);
const bundledConfig = renderCompose([
  "compose.yaml",
  "compose.worker.yaml",
  "compose.temporal.yaml",
]);
const legacyTemporalPasswordConfig = renderCompose(
  ["compose.yaml", "compose.worker.yaml", "compose.temporal.yaml"],
  { TEMPORAL_POSTGRES_PASSWORD: "" },
);
const explicitTemporalConfig = renderCompose(["compose.yaml", "compose.worker.yaml"], {
  BISIBILITY_DEPLOYMENT_SUFFIX: "",
  TEMPORAL_ALERT_DELIVERY_TASK_QUEUE: "explicit-alert-deliveries",
  TEMPORAL_NAMESPACE: "explicit-namespace",
  TEMPORAL_TASK_QUEUE: "explicit-rank-checks",
});
assert(
  JSON.stringify(Object.keys(coreConfig.services).sort()) ===
    JSON.stringify(["app", "db-migrations", "postgres", "redis"]),
  "Core Compose must contain only the app, migration, PostgreSQL, and Redis services",
);
for (const service of [coreConfig.services.app, coreConfig.services["db-migrations"]]) {
  assert(service.environment.SCHEDULER_DRIVER === "none", "Core services must disable scheduling");
  assert(
    !Object.keys(service.environment).some((key) => key.startsWith("TEMPORAL_")),
    "Core services must not receive Temporal defaults",
  );
}
assert(workerConfig.services.worker, "Worker overlay must add the worker service");
assert(
  !workerConfig.services.worker.depends_on?.temporal,
  "External worker overlay must not depend on a service named temporal",
);
for (const serviceName of ["app", "worker"]) {
  const environment = workerConfig.services[serviceName].environment;
  assert(environment.SCHEDULER_DRIVER === "temporal", `${serviceName} must use the Temporal driver`);
  assert(
    environment.BISIBILITY_DEPLOYMENT_SUFFIX === "a1b2c3d4",
    `${serviceName} must receive the shared deployment suffix`,
  );
}
for (const key of [
  "BISIBILITY_DEPLOYMENT_SUFFIX",
  "TEMPORAL_NAMESPACE",
  "TEMPORAL_TASK_QUEUE",
  "TEMPORAL_ALERT_DELIVERY_TASK_QUEUE",
]) {
  assert(
    workerConfig.services.app.environment[key] === workerConfig.services.worker.environment[key],
    `Web and worker must receive the same ${key}`,
  );
}
for (const serviceName of ["app", "worker"]) {
  const environment = explicitTemporalConfig.services[serviceName].environment;
  assert(
    environment.TEMPORAL_NAMESPACE === "explicit-namespace" &&
      environment.TEMPORAL_TASK_QUEUE === "explicit-rank-checks" &&
      environment.TEMPORAL_ALERT_DELIVERY_TASK_QUEUE === "explicit-alert-deliveries",
    `${serviceName} must accept every explicit Temporal identifier without a suffix`,
  );
}
assert(
  workerConfig.services.worker.restart === "unless-stopped",
  "Compose worker must retain a restart policy after bounded startup retries are exhausted",
);
assert(
  legacyTemporalPasswordConfig.services["temporal-postgres"].environment.POSTGRES_PASSWORD ===
    composeEnv.POSTGRES_PASSWORD,
  "Existing installs without TEMPORAL_POSTGRES_PASSWORD must retain the legacy password fallback",
);
assert(
  railwayWorker.deploy?.restartPolicyType === "ON_FAILURE" &&
    railwayWorker.deploy?.restartPolicyMaxRetries === 10,
  "Railway worker must restart bounded startup failures",
);
for (const serviceName of ["temporal-postgres", "temporal-schema", "temporal", "temporal-namespace"]) {
  assert(bundledConfig.services[serviceName], `Bundled overlay is missing ${serviceName}`);
}
assert(
  bundledConfig.services.worker.depends_on?.["temporal-namespace"]?.condition ===
    "service_completed_successfully",
  "Bundled worker must wait for namespace initialization",
);
assert(
  composeTemporal.includes("update-schema") && composeTemporal.includes("namespace create"),
  "Bundled overlay must initialize both persistence schemas and the namespace",
);
assert(
  composeCore.includes("SCHEDULER_DRIVER: none") &&
    composeWorker.includes("SCHEDULER_DRIVER: temporal"),
  "Compose driver declarations are missing",
);
assert(
  composeBuild.includes("dockerfile: Dockerfile.worker"),
  "Source build overlay must build the worker from Dockerfile.worker",
);
assert(
  alertRemediationSmoke.includes('"npm", ["run", "db:migrate"]'),
  "Alert remediation smoke must run the coordinated migration runner",
);
assert(
  alertRemediationSmoke.includes('DEPLOYMENT_ENV: "test"'),
  "Alert remediation smoke must use the explicit test migration context",
);
assert(
  instrumentation.includes("enforceMigrationsAtStartup"),
  "Node startup must fail closed when active data migrations are incomplete",
);
assert(
  instrumentation.includes("assertCanonicalHostedMcpOrigin"),
  "Node startup must fail closed when hosted MCP origins diverge",
);
assert(
  health.includes("readMigrationReadiness") &&
    health.includes('migrations !== "ready"'),
  "Health readiness must fail when active data migrations are incomplete",
);
assert(
  temporalWorker.includes('from "../data-migrations/readiness"') &&
    temporalWorker.indexOf("await assertMigrationsReady()") <
      temporalWorker.indexOf("await enforceWorkerSchemaGuard()"),
  "Temporal worker startup must require active data migrations before its schema guard",
);
const flyWeb = readFileSync("deploy/fly.web.toml", "utf8");
const flyWorker = readFileSync("deploy/fly.worker.toml", "utf8");
assert(flyWeb.includes(`dockerfile = "../Dockerfile"`), "Fly web must use the repository-root Dockerfile (path is relative to the config file)");
assert(flyWeb.includes(migrationRunner), "Fly web must run the coordinated migration runner");
assert(
  flyWeb.includes('release_command_timeout = "30m"'),
  "Fly web must allow deploy-blocking data migrations to exceed the five-minute default",
);
assert(flyWeb.includes('path = "/api/v1/readiness"'), "Fly web readiness check is missing");
assert(flyWorker.includes(`dockerfile = "../Dockerfile.worker"`), "Fly worker must use the repository-root Dockerfile.worker (path is relative to the config file)");
assert(flyWorker.includes('[[restart]]'), "Fly worker restart policy is missing");
assert(flyWorker.includes('policy = "on-failure"'), "Fly worker must restart on failure");
assert(flyWorker.includes("retries = 50"), "Fly worker restart budget must cover Temporal startup");

console.log("Deployment manifests are structurally valid.");
