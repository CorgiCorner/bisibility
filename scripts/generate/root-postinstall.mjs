#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const AMPLIFY_SKIP_ENV = "BISIBILITY_AMPLIFY_SKIP_ROOT_POSTINSTALL";
const POSTINSTALL_SCRIPTS = [
  "scripts/generate/generate-client-if-schema.mjs",
  "scripts/deploy/bake-runtime-env.mjs",
];

function trimmed(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function shouldSkipRootPostinstall(env = process.env) {
  const requested = trimmed(env[AMPLIFY_SKIP_ENV]);
  if (!requested) return false;
  if (requested !== "1") {
    throw new Error(`${AMPLIFY_SKIP_ENV} must be exactly 1 when set`);
  }
  if (!trimmed(env.AWS_APP_ID) || !trimmed(env.AWS_BRANCH)) {
    throw new Error(`${AMPLIFY_SKIP_ENV} is restricted to AWS Amplify builds`);
  }
  return true;
}

export function runRootPostinstall({
  env = process.env,
  run = (script) =>
    spawnSync(process.execPath, [script], {
      env,
      stdio: "inherit",
    }),
} = {}) {
  if (shouldSkipRootPostinstall(env)) {
    console.log("[postinstall] deferred Prisma generation and runtime env bake to Amplify build");
    return;
  }

  for (const script of POSTINSTALL_SCRIPTS) {
    const result = run(script);
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`${script} failed with exit code ${result.status ?? 1}`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runRootPostinstall();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
