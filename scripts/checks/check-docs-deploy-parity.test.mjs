import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { it } from "node:test";
import { expectedDocsInventory } from "./docs-inventory.mjs";

const script = fileURLToPath(new URL("./check-docs-deploy-parity.mjs", import.meta.url));

it("cannot report deployed-documentation success when the origin is absent", () => {
  const result = spawnSync(process.execPath, [script, "--require-live"], {
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    env: { ...process.env, DOCS_DEPLOY_ORIGIN: "", DOCS_SOURCE_ROOT: "" },
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DOCS_DEPLOY_ORIGIN is required/);
});

it("checks every published navigation page, canonical, index and schema", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "docs-parity-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const pages = ["index", ...Array.from({ length: 20 }, (_, i) => `guide-${i}`)];
  writeFileSync(join(directory, "docs.json"), JSON.stringify({ navigation: { pages } }));
  const schema = { paths: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [
    `/things/${i}`, { get: { summary: `Read thing ${i}`, tags: ["Things"] } },
  ])) };
  writeFileSync(join(directory, "openapi.snapshot.json"), JSON.stringify(schema));
  const inventory = expectedDocsInventory({ docsRoot: directory });
  let scenario = "valid";
  let origin;
  const server = createServer((request, response) => {
    const path = request.url.slice("/docs/".length);
    if (request.url === "/docs/llms.txt") {
      const entries = [...inventory.authored, ...inventory.reference, "openapi.snapshot.json"]
        .filter(page => scenario !== "missing-index-entry" || page !== "guide-19");
      response.end(entries.map(page => `- [${page}](${origin}/${page})`).join("\n"));
    } else if (request.url === "/docs/openapi.snapshot.json") {
      response.end(JSON.stringify(scenario === "stale-schema" ? {} : schema));
    } else if (scenario === "missing-page" && path === "guide-19") {
      response.writeHead(404).end("Missing");
    } else {
      const canonical = scenario === "wrong-canonical" && path === "guide-19"
        ? `${origin}/guide-19-old` : `${origin}/${path}`;
      response.end(`<link rel="canonical" href="${canonical}">`);
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  origin = `http://127.0.0.1:${server.address().port}/docs`;
  const run = () => promisify(execFile)(process.execPath, [script, "--require-live"], {
    env: { ...process.env, DOCS_DEPLOY_ORIGIN: origin, DOCS_SOURCE_ROOT: directory },
  });
  await run();
  for (const [name, message] of [
    ["missing-page", /guide-19 returned HTTP 404/],
    ["wrong-canonical", /canonical does not match/],
    ["missing-index-entry", /llms.txt missing guide-19/],
    ["stale-schema", /Deployed OpenAPI differs/],
  ]) {
    scenario = name;
    await assert.rejects(run(), error => error.code === 1 && message.test(error.stderr), name);
  }
});
