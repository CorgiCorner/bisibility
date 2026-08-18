import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { scanRuntimeEnvNames } from "./public-env-scanner.mjs";

function makeTmpRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "env-scanner-isolation-"));
  for (const directory of ["app", "lib", "components"]) {
    mkdirSync(path.join(root, directory), { recursive: true });
  }
  for (const file of [
    "middleware.ts",
    "instrumentation.ts",
    "instrumentation-client.ts",
    "next.config.ts",
    "sentry.edge.config.ts",
    "sentry.server.config.ts",
  ]) {
    writeFileSync(path.join(root, file), "");
  }
  return root;
}

describe("scanRuntimeEnvNames caller-provided root isolation", () => {
  const root = makeTmpRoot();
  after(() => rmSync(root, { recursive: true, force: true }));

  it("scans only the fixture root, not the real checkout", () => {
    writeFileSync(path.join(root, "lib", "fixture.ts"),
      "export const x = process.env.FIXTURE_ONLY_VAR;\n");
    const names = new Set(scanRuntimeEnvNames(root));
    assert.ok(names.has("FIXTURE_ONLY_VAR"));
    assert.equal(names.has("DATABASE_URL"), false);
  });
});
