const markdownableMethods = new Set(["GET", "HEAD"]);

const markdownSkipPrefixes = [
  "/api",
  "/.well-known",
  "/_next",
  "/app",
  "/login",
  "/llms.txt",
  "/onboarding",
  "/robots.txt",
  "/sitemap.xml",
];

const markdownPaths = new Set(["/", "/roadmap", "/changelog", "/privacy", "/security", "/terms"]);
const binaryOrTextAsset = /\.[a-z0-9]{2,5}$/i;

function qValue(part: string) {
  const q = /;\s*q=([0-9.]+)/i.exec(part)?.[1];
  if (!q) {
    return 1;
  }
  const value = Number(q);
  return Number.isFinite(value) ? value : 0;
}

function mediaType(part: string) {
  return part.trim().toLowerCase().split(";")[0] ?? "";
}

function maxQ(parts: string[], type: string) {
  return Math.max(0, ...parts.filter((part) => mediaType(part) === type).map(qValue));
}

export function acceptsMarkdown(accept: string | null) {
  if (!accept) {
    return false;
  }

  const parts = accept.split(",");
  const markdownQ = maxQ(parts, "text/markdown");
  if (markdownQ <= 0) {
    return false;
  }

  return markdownQ >= maxQ(parts, "text/html");
}

function matchesPathSegment(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function shouldVaryOnAccept(request: Request) {
  const url = new URL(request.url);
  if (!markdownableMethods.has(request.method)) {
    return false;
  }
  if (markdownSkipPrefixes.some((prefix) => matchesPathSegment(url.pathname, prefix))) {
    return false;
  }
  return markdownPaths.has(url.pathname) && !binaryOrTextAsset.test(url.pathname);
}

export function shouldServeMarkdown(request: Request) {
  return shouldVaryOnAccept(request) && acceptsMarkdown(request.headers.get("accept"));
}

function titleForPath(pathname: string) {
  if (pathname === "/") {
    return "bisibility";
  }

  return pathname
    .split("/")
    .filter(Boolean)
    .map((segment) =>
      segment
        .replaceAll("-", " ")
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" "),
    )
    .join(" - ");
}

export function createMarkdownForRequest(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const title = titleForPath(url.pathname);

  return [
    `# ${title}`,
    "",
    "bisibility is an open-source keyword rank tracker with bring-your-own SERP",
    "provider credentials, owned Postgres history, a REST API, OpenAPI metadata,",
    "Agent Skills, and MCP discovery surfaces.",
    "",
    "## Requested page",
    "",
    `- URL: ${url.toString()}`,
    "",
    "## Agent entry points",
    "",
    `- API llms.txt: ${origin}/api/v1/llms.txt`,
    `- OpenAPI: ${origin}/api/v1/openapi.json`,
    `- Capabilities: ${origin}/api/v1/capabilities`,
    `- Agent Skills: ${origin}/.well-known/agent-skills/index.json`,
    `- MCP server card: ${origin}/.well-known/mcp/server-card.json`,
    `- Auth metadata: ${origin}/auth.md`,
    "",
    "## Common workflows",
    "",
    "- Create a personal access token in Account -> Security for user or cross-project work.",
    "- Create a project API key in Project Settings -> API keys for one-project work.",
    "- Connect a SERP provider with your own credentials.",
    "- Add tracked keywords and run rank checks through the app or REST API.",
    "- Read positions, rank history, alerts, providers, and projects through `/api/v1`.",
  ].join("\n");
}

export function markdownWordCount(markdown: string) {
  return markdown.trim().split(/\s+/).filter(Boolean).length;
}
