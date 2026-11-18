import { type SerializedConfig, TestRunner } from "vitest";

const cleanupRegistered = Symbol.for("bisibility.test.workerFixtureCleanup");

export default class SharedWorkerRunner extends TestRunner {
  constructor(config: SerializedConfig) {
    super(config);
    const register = this.onCleanupWorkerContext;
    if (config.isolate || !register) return;

    // Setup resets application modules per file, so registration must survive module reloads.
    const worker = process as NodeJS.Process & { [cleanupRegistered]?: boolean };
    this.onCleanupWorkerContext = (cleanup) => {
      if (worker[cleanupRegistered]) return;
      // The stock callback reads the shared fixture registry at shutdown, including later files.
      register(async () => {
        try {
          await cleanup();
        } finally {
          delete worker[cleanupRegistered];
        }
      });
      worker[cleanupRegistered] = true;
    };
  }
}
