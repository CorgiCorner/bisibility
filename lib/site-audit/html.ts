import { type DefaultTreeAdapterMap, parse } from "parse5";
import type { SiteAuditIssue, SiteAuditPage } from "./schema";
import { sameOriginAuditUrl } from "./target";

type Node = DefaultTreeAdapterMap["node"];
function elements(root: Node) {
  const found: DefaultTreeAdapterMap["element"][] = [];
  const queue: Node[] = [root];
  while (queue.length && found.length < 15_000) {
    const node = queue.pop();
    if (!node) break;
    if ("tagName" in node) found.push(node);
    if ("childNodes" in node)
      for (let index = node.childNodes.length - 1; index >= 0; index--)
        queue.push(node.childNodes[index]);
  }
  return found;
}
function attribute(node: DefaultTreeAdapterMap["element"], name: string) {
  return node.attrs.find((attr) => attr.name === name)?.value ?? null;
}
function text(root: Node): string {
  const queue = [root];
  const parts: string[] = [];
  let length = 0;
  while (queue.length && length < 2000) {
    const node = queue.pop();
    if (!node) break;
    if ("value" in node) {
      parts.push(node.value);
      length += node.value.length;
    }
    if ("childNodes" in node)
      for (let index = node.childNodes.length - 1; index >= 0; index--)
        queue.push(node.childNodes[index]);
  }
  return parts.join(" ");
}
function clean(value: string | null, limit = 400) {
  return value?.replace(/\s+/g, " ").trim().slice(0, limit) || null;
}
export function inspectHtml(
  input: { html: string; url: string; status: number; headers: Headers; responseTimeMs: number },
  requestedUrl: string,
) {
  const nodes = elements(parse(input.html));
  const url = new URL(input.url);
  const meta = (name: string) =>
    nodes.find(
      (node) => node.tagName === "meta" && attribute(node, "name")?.toLowerCase() === name,
    );
  const title = clean(text(nodes.find((node) => node.tagName === "title") ?? parse("")), 200);
  const descriptionNode = meta("description");
  const description = clean(descriptionNode ? attribute(descriptionNode, "content") : null, 320);
  const canonicalNode = nodes.find(
    (node) => node.tagName === "link" && attribute(node, "rel")?.split(/\s+/).includes("canonical"),
  );
  const canonical = clean(canonicalNode ? attribute(canonicalNode, "href") : null, 512);
  const robotsNode = meta("robots");
  const robots = clean(
    [input.headers.get("x-robots-tag"), robotsNode ? attribute(robotsNode, "content") : null]
      .filter(Boolean)
      .join(", "),
    200,
  );
  const noindex = /\b(noindex|none)\b/i.test(robots ?? "");
  const headings = nodes.filter((node) => /^h[1-6]$/.test(node.tagName));
  const h1Count = headings.filter((node) => node.tagName === "h1").length;
  const images = nodes.filter((node) => node.tagName === "img");
  // An empty alt is valid for decorative images; an absent attribute is an issue.
  const missingAltCount = images.filter((node) => attribute(node, "alt") === null).length;
  const links = nodes
    .filter((node) => node.tagName === "a")
    .map((node) => attribute(node, "href"))
    .filter((href): href is string => href !== null);
  const discovered = [
    ...new Set(
      links
        .map((href) => sameOriginAuditUrl(href, url, url.origin)?.href)
        .filter((href): href is string => !!href),
    ),
  ].slice(0, 200);
  let externalLinkCount = 0;
  let internalLinkCount = 0;
  for (const href of links) {
    try {
      const linked = new URL(href, url);
      if (!["http:", "https:"].includes(linked.protocol)) continue;
      if (linked.origin === url.origin) internalLinkCount++;
      else externalLinkCount++;
    } catch {
      /* Invalid links are excluded from the crawl. */
    }
  }
  const issues: SiteAuditIssue[] = [];
  const add = (code: string, severity: SiteAuditIssue["severity"], message: string) =>
    issues.push({ code, severity, message });
  if (input.status >= 400) add("http_error", "error", `HTTP ${input.status}`);
  const isHtml = input.headers.get("content-type")?.toLowerCase().includes("text/html") ?? false;
  if (!isHtml) add("non_html", "info", "Response is not HTML; on-page checks are unavailable.");
  if (isHtml) {
    if (!title) add("missing_title", "warning", "Title is missing.");
    if (!description) add("missing_description", "warning", "Meta description is missing.");
    if (h1Count !== 1) add("h1_count", "warning", `${h1Count} H1 headings; expected one.`);
    if (missingAltCount)
      add("missing_image_alt", "warning", `${missingAltCount} images have no alt attribute.`);
    if (noindex) add("noindex", "info", "Robots directives disallow indexing.");
  }
  const page: SiteAuditPage = {
    url: requestedUrl,
    finalUrl: input.url,
    status: input.status,
    responseTimeMs: input.responseTimeMs,
    title,
    description,
    canonical,
    headings: headings.slice(0, 5).map((node) => ({
      level: Number(node.tagName.slice(1)),
      text: clean(text(node), 160) ?? "",
    })),
    h1Count,
    indexable: isHtml && input.status >= 200 && input.status < 300 && !noindex,
    robots,
    internalLinkCount,
    externalLinkCount,
    internalLinks: discovered.slice(0, 5),
    imageCount: images.length,
    missingAltCount,
    issues,
  };
  return { page, discovered: isHtml && input.status < 400 ? discovered : [] };
}
