#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { deployedOpenApiMatches, diffDocsInventory, expectedDocsInventory, parseLlmsTxt } from "./docs-inventory.mjs";

const root = process.cwd();
const docsRoot = join(root, "docs");
const origin = process.env.DOCS_DEPLOY_ORIGIN?.replace(/\/+$/, "");
const failures = [];

const expected = expectedDocsInventory({ docsRoot });
if (expected.authored.length < 20) {
  failures.push(`docs inventory authored page count looks too small: ${expected.authored.length}`);
}
if (expected.reference.length < 50) {
  failures.push(
    `docs inventory API reference count looks too small: ${expected.reference.length}`,
  );
}

const docsConfig = JSON.parse(readFileSync(join(docsRoot, "docs.json"), "utf8"));
if (docsConfig.seo?.metatags?.canonical) {
  failures.push("deployed docs must not inherit a global canonical from docs.json");
}

if (origin) {
  const llmsUrl = `${origin}/llms.txt`;
  const response = await fetch(llmsUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    failures.push(`${llmsUrl} returned HTTP ${response.status}`);
  } else {
    const livePaths = parseLlmsTxt(await response.text());
    const diff = diffDocsInventory(expected, livePaths);
    for (const path of diff.missingFromLive) {
      failures.push(`deployed llms.txt missing ${path}`);
    }
    for (const path of diff.extraInLive) {
      failures.push(`deployed llms.txt has extra ${path}`);
    }
  }

  const openapiResponse = await fetch(`${origin}/openapi.snapshot.json`, {
    signal: AbortSignal.timeout(15000),
  });
  const expectedOpenApi = JSON.parse(readFileSync(join(docsRoot, "openapi.snapshot.json"), "utf8"));
  if (!openapiResponse.ok || !deployedOpenApiMatches(expectedOpenApi, await openapiResponse.json())) {
    failures.push("Deployed OpenAPI differs from this checkout; compare against the intended published release.");
  }

  const samplePages = ["/", "/quickstart", "/versioning", "/hosted-quickstart", "/api/quickstart", "/api/checks", "/api/domain-overview", "/markets"];
  for (const page of samplePages) {
    const url = `${origin}${page === "/" ? "" : page}`;
    const pageResponse = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15000) });
    if (!pageResponse.ok) {
      failures.push(`${url} returned HTTP ${pageResponse.status}`);
      continue;
    }
    const html = await pageResponse.text();
    const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0] ?? "";
    const href = canonical.match(/href=["']([^"']+)["']/i)?.[1] ?? "";
    if (!href) {
      failures.push(`${url} is missing a canonical link`);
      continue;
    }
    if (href === `${origin}` || href === `${origin}/` || href.endsWith("/docs") || href.endsWith("/docs/")) {
      if (page !== "/") failures.push(`${url} canonical collapsed to docs root: ${href}`);
    }
    if (page !== "/" && href.replace(/\/$/, "").endsWith(page) === false && !href.includes(page)) {
      failures.push(`${url} canonical does not match the page: ${href}`);
    }
  }
} else {
  console.log(
    "DOCS_DEPLOY_ORIGIN is unset; checked source inventory only. Set it to the deployed docs origin for live llms.txt and canonical HTML checks.",
  );
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(
  `Docs inventory: ${expected.authored.length} authored pages, ${expected.reference.length} API reference operations.`,
);
