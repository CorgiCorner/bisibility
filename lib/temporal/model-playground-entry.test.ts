import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("both entries import registration and install the report hook", () => {
  const result = execFileSync(
    process.execPath,
    [
      "--experimental-transform-types",
      "--import",
      "./lib/temporal/register-loader.mjs",
      "--input-type=module",
      "--eval",
      `await import('./lib/temporal/worker.ts');
     const {modelPlaygroundRuntimeBindings: bindings} = await import('./lib/model-playground/runtime-bindings.ts');
     if (typeof bindings.onTerminal !== 'function') throw new Error('Worker terminal hook must be installed');
     console.log('terminal registration imported');`,
    ],
    {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_ENV: "production",
        TEMPORAL_WORKER_SMOKE: "1",
      },
      encoding: "utf8",
      timeout: 30_000,
    },
  );
  expect(result).toContain("terminal registration imported");
  expect(readFileSync("lib/temporal/worker.ts", "utf8")).toContain(
    'import "../model-playground/runtime-registration"',
  );
  expect(readFileSync("instrumentation.ts", "utf8")).toContain(
    'import("./lib/model-playground/runtime-registration")',
  );
}, 35_000);
