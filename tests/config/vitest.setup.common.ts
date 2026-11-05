import { FROZEN_NOW } from "@/tests/clock";
import type { PGliteOptions } from "@electric-sql/pglite";
import { afterAll, beforeEach, vi } from "vitest";

// The node `unit` project runs many files in one worker process (isolate: false). This block gives
// each file the state a fresh process would: application modules re-evaluate, so every file's
// vi.mock calls apply; native node_modules and the worker itself are shared.
vi.resetModules();

// Every file starts with the environment the worker started with. Tests also assign process.env
// directly, which vi.unstubAllEnvs() cannot undo.
{
  const worker = globalThis as typeof globalThis & { __initialTestEnv?: NodeJS.ProcessEnv };
  worker.__initialTestEnv ??= { ...process.env };
  for (const key of Object.keys(process.env))
    if (!Object.hasOwn(worker.__initialTestEnv, key)) delete process.env[key];
  Object.assign(process.env, worker.__initialTestEnv);
}
vi.useRealTimers();

// Undo test doubles an earlier file left on globalThis by plain assignment, or by a spy restored onto
// a fake clock's function. Deliberate runtime patches (Next wraps fetch and timers) stay.
{
  const doubledGlobals = [
    "fetch",
    "Request",
    "Response",
    "Headers",
    "setTimeout",
    "clearTimeout",
    "setInterval",
    "clearInterval",
    "setImmediate",
    "clearImmediate",
    "queueMicrotask",
  ] as const;
  const worker = globalThis as typeof globalThis & {
    __initialTestGlobals?: Record<string, unknown>;
  };
  worker.__initialTestGlobals ??= Object.fromEntries(
    doubledGlobals.map((key) => [key, globalThis[key]]),
  );
  for (const key of doubledGlobals) {
    const current: unknown = globalThis[key];
    const isDouble =
      vi.isMockFunction(current) || (typeof current === "function" && "clock" in current);
    if (isDouble) Object.assign(globalThis, { [key]: worker.__initialTestGlobals[key] });
  }
}

// The Next Node runtime installs this global (node-environment-baseline) before request code loads.
// Next captures it when its module first loads, which a shared worker does only once.
if (typeof window === "undefined" && typeof globalThis.AsyncLocalStorage !== "function") {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  globalThis.AsyncLocalStorage = AsyncLocalStorage;
}

vi.mock("next/navigation", () => import("@/tests/next-navigation"));

// Each `new PGlite()` runs initdb in WASM (~0.5 s), once per SQL fixture test. In-memory instances
// start from a copy of one fresh initdb data directory instead, cached on disk per PGlite version.
// Every instance is still a new, independent database; only the identical bootstrap is reused.
vi.mock("@electric-sql/pglite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@electric-sql/pglite")>();
  const { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } = await import(
    "node:fs"
  );
  const { join } = await import("node:path");
  const packageFile = join(process.cwd(), "node_modules/@electric-sql/pglite/package.json");
  const { version } = JSON.parse(readFileSync(packageFile, "utf8")) as { version: string };
  const cacheDir = join(process.cwd(), "node_modules/.cache/vitest-pglite");
  const snapshotFile = join(cacheDir, `initdb-${version}.tar`);
  if (!existsSync(snapshotFile)) {
    const fresh = new actual.PGlite();
    const dump = Buffer.from(await (await fresh.dumpDataDir("none")).arrayBuffer());
    await fresh.close();
    mkdirSync(cacheDir, { recursive: true });
    // Parallel workers may create it at the same time; each renames a complete private copy.
    const partial = `${snapshotFile}.${process.pid}.partial`;
    writeFileSync(partial, dump);
    renameSync(partial, snapshotFile);
  }
  const snapshot = new Blob([readFileSync(snapshotFile)]);
  class PGlite extends actual.PGlite {
    constructor(dataDirOrOptions?: string | PGliteOptions, options?: PGliteOptions) {
      if (typeof dataDirOrOptions === "string") {
        super(dataDirOrOptions, options);
      } else {
        const inMemory = dataDirOrOptions ?? {};
        super(
          inMemory.dataDir || inMemory.loadDataDir
            ? inMemory
            : { ...inMemory, loadDataDir: snapshot },
        );
      }
    }
  }
  return { ...actual, PGlite };
});

function resetSystemDate() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FROZEN_NOW);
}

resetSystemDate();
beforeEach(resetSystemDate);

afterAll(() => {
  // Restore spies before the clock: a spy created on a fake timer function would otherwise put
  // that dead function back on globalThis after the real timers were reinstalled.
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
