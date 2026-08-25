import { dirname, relative, resolve } from "node:path";

/**
 * Link resolution rules for documentation content.
 *
 * The Mintlify site is deployed under the `/docs` basepath and rewrites root-relative
 * hrefs to include it. A page authored as `](/api/discovery#liveness-and-readiness)`
 * ships as `href="/docs/api/discovery#liveness-and-readiness"`, so documentation sources
 * must omit the prefix. Writing it by hand produces `/docs/docs/...` once Mintlify
 * applies its own rewrite, which is why `deploymentDocsPath` is a failure inside docs
 * content rather than an accepted alternative spelling.
 *
 * The corollary trips up reviewers reading raw MDX: `/api/discovery` looks like the
 * application's `/api` namespace, where it really would be a 404. It is not - it names
 * the `docs/api/discovery.mdx` page. A root-relative `/api/...` href only fails when no
 * documentation page backs it, and then it must be written as an absolute URL.
 */

const DOCS_DEPLOYMENT_PREFIX = "/docs";
const DOCS_DEPLOYMENT_ORIGIN = "https://bisibility.com/docs";

/**
 * Strips the deployment basepath from an href that carries it.
 *
 * @returns the docs-relative path, or `undefined` when the href carries no prefix.
 */
export function deploymentDocsPath(href) {
  if (href === DOCS_DEPLOYMENT_PREFIX || href.startsWith(`${DOCS_DEPLOYMENT_PREFIX}/`)) {
    return href.slice(DOCS_DEPLOYMENT_PREFIX.length);
  }
  if (href === DOCS_DEPLOYMENT_ORIGIN || href.startsWith(`${DOCS_DEPLOYMENT_ORIGIN}/`)) {
    return href.slice(DOCS_DEPLOYMENT_ORIGIN.length);
  }
}

/**
 * Classifies one href found in a Markdown or MDX source file.
 *
 * @returns a failure message, or `null` when the link is valid.
 */
export function classifyDocsHref({ source, href, root, docsRoot, docsPageExists, fileExists }) {
  const withoutAnchor = href.split("#", 1)[0].split("?", 1)[0];
  if (!withoutAnchor || withoutAnchor.startsWith("mailto:")) return null;

  const fail = (message) => `${relative(root, source)}: ${message}`;
  const sourceRelativeToDocs = relative(docsRoot, source);
  const isDocsContent = sourceRelativeToDocs !== "" && !sourceRelativeToDocs.startsWith("..");
  const docsPath = deploymentDocsPath(withoutAnchor);

  if (isDocsContent && docsPath !== undefined) {
    return fail(`docs links must omit the deployment prefix ${href}`);
  }

  if (docsPath !== undefined) {
    return docsPageExists(docsPath) ? null : fail(`missing docs page ${href}`);
  }

  if (isDocsContent && withoutAnchor.startsWith("/")) {
    if (docsPageExists(withoutAnchor)) return null;
    return fail(
      withoutAnchor.startsWith("/api/")
        ? `application API links must use an absolute URL when docs are mounted at /docs ${href}`
        : `missing docs page ${href}`,
    );
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(withoutAnchor) || withoutAnchor.startsWith("/")) return null;

  const target = resolve(dirname(source), withoutAnchor);
  return fileExists(target) ? null : fail(`missing file ${href}`);
}
