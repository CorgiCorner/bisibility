import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";
import { classifyDocsHref, deploymentDocsPath } from "./doc-link-helpers.mjs";

const root = "/repo";
const docsRoot = join(root, "docs");

// The pages a hermetic fixture site publishes. `api/discovery` is the real case that
// reviewers misread as the application's /api namespace.
const publishedPages = new Set(["/api/discovery", "/api/quickstart", "/quickstart", "/index"]);

function classify(href, { source = join(docsRoot, "quickstart.mdx"), files = [] } = {}) {
  const present = new Set(files);
  return classifyDocsHref({
    source,
    href,
    root,
    docsRoot,
    docsPageExists: (page) => publishedPages.has(`/${page.replace(/^\/+|\/$/g, "")}`),
    fileExists: (path) => present.has(path),
  });
}

describe("deploymentDocsPath", () => {
  it("strips the root-relative and absolute deployment basepath", () => {
    assert.equal(deploymentDocsPath("/docs/api/discovery"), "/api/discovery");
    assert.equal(deploymentDocsPath("/docs"), "");
    assert.equal(deploymentDocsPath("https://bisibility.com/docs/api/discovery"), "/api/discovery");
    assert.equal(deploymentDocsPath("https://bisibility.com/docs"), "");
  });

  it("leaves hrefs that carry no basepath untouched", () => {
    assert.equal(deploymentDocsPath("/api/discovery"), undefined);
    assert.equal(deploymentDocsPath("/docsearch/setup"), undefined);
    assert.equal(deploymentDocsPath("https://bisibility.com/pricing"), undefined);
  });
});

describe("classifyDocsHref inside documentation content", () => {
  it("accepts a root-relative link to a published page", () => {
    assert.equal(classify("/api/discovery#liveness-and-readiness"), null);
  });

  // Mintlify adds the /docs basepath at render time. Authoring it in the source would
  // ship /docs/docs/api/discovery, so the guard must reject it.
  it("rejects a hand-written /docs deployment prefix", () => {
    assert.equal(
      classify("/docs/api/discovery#liveness-and-readiness"),
      "docs/quickstart.mdx: docs links must omit the deployment prefix /docs/api/discovery#liveness-and-readiness",
    );
  });

  it("rejects an absolute URL that points back at the deployed docs site", () => {
    assert.equal(
      classify("https://bisibility.com/docs/api/discovery"),
      "docs/quickstart.mdx: docs links must omit the deployment prefix https://bisibility.com/docs/api/discovery",
    );
  });

  it("requires an absolute URL for /api paths that no documentation page backs", () => {
    assert.equal(
      classify("/api/v1/liveness"),
      "docs/quickstart.mdx: application API links must use an absolute URL when docs are mounted at /docs /api/v1/liveness",
    );
  });

  it("reports any other unbacked root-relative link as a missing page", () => {
    assert.equal(classify("/self-hosting/typo"), "docs/quickstart.mdx: missing docs page /self-hosting/typo");
  });

  it("ignores external URLs, mailto links, and bare anchors", () => {
    assert.equal(classify("https://example.com/anything"), null);
    assert.equal(classify("mailto:support@example.com"), null);
    assert.equal(classify("#liveness-and-readiness"), null);
  });
});

describe("classifyDocsHref outside documentation content", () => {
  const source = join(root, "README.md");

  it("accepts a deployed docs URL that resolves to a published page", () => {
    assert.equal(classify("https://bisibility.com/docs/api/discovery", { source }), null);
    assert.equal(classify("/docs/api/discovery", { source }), null);
  });

  it("rejects a deployed docs URL with no page behind it", () => {
    assert.equal(
      classify("/docs/api/removed", { source }),
      "README.md: missing docs page /docs/api/removed",
    );
  });

  it("resolves relative links against the source file", () => {
    assert.equal(classify("docs/quickstart.mdx", { source, files: [join(root, "docs/quickstart.mdx")] }), null);
    assert.equal(classify("docs/missing.mdx", { source }), "README.md: missing file docs/missing.mdx");
  });
});
