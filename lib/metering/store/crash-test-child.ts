import { fork } from "node:child_process";
import { once } from "node:events";

export async function killAtBarrier(
  url: string,
  schema: string,
  phase: string,
  providerUrl?: string,
) {
  const child = fork("lib/metering/store/crash-test-process.ts", [], {
    execArgv: ["--experimental-transform-types", "--import", "./lib/temporal/register-loader.mjs"],
    env: {
      ...process.env,
      METERING_TEST_DATABASE_URL: url,
      METERING_TEST_SCHEMA: schema,
      METERING_CRASH_PHASE: phase,
      METERING_TEST_PROVIDER_URL: providerUrl,
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let diagnostics = "";
  child.stderr?.on("data", (chunk) => {
    diagnostics += String(chunk);
  });
  try {
    const message = await Promise.race([
      once(child, "message").then(
        ([message]) => message as { expectedVersion: number; leaseId: string },
      ),
      once(child, "exit").then(() => {
        throw new Error(`Crash child exited before ${phase}: ${diagnostics}`);
      }),
    ]);
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    const [, signal] = await exited;
    if (signal !== "SIGKILL") throw new Error("Crash child was not killed");
    return message;
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGKILL");
      await exited;
    }
  }
}
