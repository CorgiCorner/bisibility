import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

const { inspectRepository } = await import("./request-engine-reachability.mjs");

const LOGIN_PATH = [
  "app/(auth)/login/page.ts",
  "lib/auth/session.ts",
  "lib/auth/auth.ts",
  "lib/auth/welcome-signup.ts",
  "lib/temporal/welcome-email-client.ts",
].join(" -> ");
const AUTH_PATHS = [
  LOGIN_PATH,
  "lib/auth/auth.ts -> lib/auth/welcome-signup.ts -> lib/temporal/welcome-email-client.ts",
  "lib/auth/session.ts -> lib/auth/auth.ts -> lib/auth/welcome-signup.ts -> lib/temporal/welcome-email-client.ts",
  "lib/auth/welcome-signup.ts -> lib/temporal/welcome-email-client.ts",
].sort();

function writeModule(root, fileName, source) {
  const absolutePath = path.join(root, fileName);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, source);
}

function reexport(specifier) {
  return `export * from ${JSON.stringify(specifier)};`;
}

function sideEffectImport(specifier) {
  return `import ${JSON.stringify(specifier)};`;
}

function withLoginFixture(run) {
  const root = mkdtempSync(path.join(tmpdir(), "request-engine-reachability-"));
  try {
    writeModule(root, "app/(auth)/login/page.ts", sideEffectImport("@/lib/auth/session"));
    writeModule(root, "lib/auth/session.ts", reexport("./auth"));
    writeModule(root, "lib/auth/auth.ts", sideEffectImport("./welcome-signup"));
    writeModule(
      root,
      "lib/auth/welcome-signup.ts",
      sideEffectImport("@/lib/temporal/welcome-email-client"),
    );
    writeModule(root, "lib/temporal/welcome-email-client.ts", "export const welcome = true;");
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function withFixture(files, run) {
  const root = mkdtempSync(path.join(tmpdir(), "request-engine-reachability-"));
  try {
    for (const [fileName, source] of Object.entries(files)) writeModule(root, fileName, source);
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("request to engine client reachability guard", () => {
  it("reports the full login -> session -> auth -> welcome-email-client path", () => {
    withLoginFixture((root) => {
      const dispositions = new Map(
        AUTH_PATHS.map((requestPath) => [requestPath, "allowed: I9 replaces this with an intent write."]),
      );
      const result = inspectRepository(root, dispositions);

      assert.ok(result.reachablePaths.some(({ key }) => key === LOGIN_PATH));
      assert.deepEqual(result.missingDispositions, []);
      assert.deepEqual(result.staleDispositions, []);
    });
  });

  it("rejects missing and stale dispositions", () => {
    withLoginFixture((root) => {
      const stalePath = "app/stale.ts -> lib/temporal/client.ts";
      const result = inspectRepository(
        root,
        new Map([[stalePath, "allowed: This isolated fixture never handles requests."]]),
      );

      assert.deepEqual(result.missingDispositions, AUTH_PATHS);
      assert.deepEqual(result.staleDispositions, [stalePath]);
    });
  });

  it("reports both simple paths through a reconvergent diamond", () => {
    withFixture(
      {
        "app/root.ts": `${sideEffectImport("./a")}\n${sideEffectImport("./b")}`,
        "app/a.ts": sideEffectImport("@/lib/shared"),
        "app/b.ts": sideEffectImport("@/lib/shared"),
        "lib/shared.ts": sideEffectImport("@/lib/temporal/client"),
        "lib/temporal/client.ts": "export const client = true;",
      },
      (root) => {
        const paths = inspectRepository(root).reachablePaths
          .map(({ key }) => key)
          .filter((key) => key.startsWith("app/root.ts -> "));

        assert.deepEqual(paths, [
          "app/root.ts -> app/a.ts -> lib/shared.ts -> lib/temporal/client.ts",
          "app/root.ts -> app/b.ts -> lib/shared.ts -> lib/temporal/client.ts",
        ]);
      },
    );
  });

  it("ignores type-only imports and follows the equivalent value import", () => {
    withFixture(
      {
        "app/root.ts": "",
        "lib/bridge.ts": `${sideEffectImport("@/lib/temporal/client")}\nexport type Bridge = string;\nexport const bridge = true;`,
        "lib/temporal/client.ts": "export const client = true;",
      },
      (root) => {
        const bridgeSpecifier = "@/lib/bridge";
        const typeOnlySources = [
          `import type { Bridge } from ${JSON.stringify(bridgeSpecifier)};`,
          `export type { Bridge } from ${JSON.stringify(bridgeSpecifier)};`,
          `import { type Bridge } from ${JSON.stringify(bridgeSpecifier)};`,
          `type ImportedBridge = typeof import(${JSON.stringify(bridgeSpecifier)});`,
        ];

        for (const source of typeOnlySources) {
          writeModule(root, "app/root.ts", source);
          assert.deepEqual(inspectRepository(root).reachablePaths, []);
        }

        writeModule(root, "app/root.ts", `import { bridge } from ${JSON.stringify(bridgeSpecifier)};`);
        assert.deepEqual(inspectRepository(root).reachablePaths.map(({ key }) => key), [
          "app/root.ts -> lib/bridge.ts -> lib/temporal/client.ts",
        ]);
      },
    );
  });
});
