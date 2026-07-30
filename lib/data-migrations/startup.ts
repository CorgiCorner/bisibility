import "server-only";

import { assertMigrationsReady } from "./readiness";

type StartupEnvironment = {
  [key: string]: string | undefined;
  NEXT_PHASE?: string;
  NEXT_RUNTIME?: string;
};

export function shouldEnforceMigrationsAtStartup(env: StartupEnvironment) {
  return env.NEXT_RUNTIME === "nodejs" && env.NEXT_PHASE !== "phase-production-build";
}

export async function enforceMigrationsAtStartup(
  env: StartupEnvironment = process.env,
  assertReady: () => Promise<void> = assertMigrationsReady,
) {
  if (!shouldEnforceMigrationsAtStartup(env)) return;
  await assertReady();
}
