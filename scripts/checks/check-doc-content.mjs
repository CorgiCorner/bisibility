#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const docsRoot = join(root, "docs");

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const docsFiles = walk(docsRoot).filter((file) => extname(file) === ".mdx");
const docsText = docsFiles.map((file) => readFileSync(file, "utf8")).join("\n");
const openapi = JSON.parse(readFileSync(join(docsRoot, "openapi.snapshot.json"), "utf8"));
const failures = [];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizedApiPath(value) {
  return value.replace(/^\/api\/v1/, "").replaceAll(/\{[^}]+\}/g, "{param}");
}

const documentedApiPaths = new Set(
  [...docsText.matchAll(/(\/(?:api\/v1\/)?[A-Za-z0-9_./{}-]+)/g)].map((match) =>
    normalizedApiPath(match[1]),
  ),
);

for (const apiPath of Object.keys(openapi.paths)) {
  if (!documentedApiPaths.has(normalizedApiPath(apiPath))) {
    failures.push(`OpenAPI path is not covered in docs: ${apiPath}`);
  }
}

for (const file of docsFiles) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(
    /`((?:app|components|lib|prisma|scripts|examples)\/[A-Za-z0-9_./-]+(?:\.[a-z]+)?)`/g,
  )) {
    const referencedPath = match[1];
    if (!existsSync(join(root, referencedPath))) {
      failures.push(`${relative(root, file)} references missing code path: ${referencedPath}`);
    }
  }
}

const auditDocs = readFileSync(join(docsRoot, "audit-log.mdx"), "utf8");
for (const action of [
  "cloud_import.begin",
  "cloud_import.session_create",
  "cloud_import.done",
  "cloud_import.fail",
  "migration_token.consume",
  "project.migration_hold.auto_release",
]) {
  if (!auditDocs.includes(`\`${action}\``)) failures.push(`Audit action is undocumented: ${action}`);
}

const requiredGuides = {
  "guides/choose-first-keywords.mdx": [
    "10-20",
    "Search Console",
    "Import CSV",
    "page that should rank",
    "Not found in the top 100",
    "how-to-choose-first-keywords-to-track",
  ],
  "guides/alerts.mdx": ["Position drop", "WEBHOOK_ALLOW_PRIVATE_NETWORK", "alert.fired"],
  "guides/analytics.mdx": ["TRAFFIC_SYNC_ENABLED", "TRAFFIC_SNAPSHOT_RETENTION_DAYS", "28-day"],
  "guides/competitors.mdx": ["keyword cap", "share of voice", "CSV"],
  "guides/email.mdx": ["EMAIL_PROVIDER", "RESEND_API_KEY", "SES_REGION", "SMTP_URL", "sandbox"],
  "guides/migration.mdx": ["single-use", "mig_", "Instance import"],
  "guides/operations.mdx": [
    "PostgreSQL",
    "BISIBILITY_SECRETS_KEY",
    "prisma migrate deploy",
    "The column ... does not exist",
  ],
  "guides/saved-views.mdx": ["location/device lens", "48 characters", "wrong-URL"],
  "guides/teams.mdx": ["seven days", "email provider", "`member`"],
};

const forbiddenGuideTerms = {
  "guides/alerts.mdx": ["Slack"],
  "guides/choose-first-keywords.mdx": ["project management for freelance designers"],
};

for (const [guide, requiredTerms] of Object.entries(requiredGuides)) {
  const guidePath = join(docsRoot, guide);
  if (!existsSync(guidePath)) {
    failures.push(`Required product guide is missing: ${guide}`);
    continue;
  }
  const guideText = readFileSync(guidePath, "utf8");
  for (const term of requiredTerms) {
    if (!guideText.includes(term)) failures.push(`${guide} is missing required coverage: ${term}`);
  }
}

for (const [guide, forbiddenTerms] of Object.entries(forbiddenGuideTerms)) {
  const guideText = readFileSync(join(docsRoot, guide), "utf8");
  for (const term of forbiddenTerms) {
    if (guideText.includes(term)) failures.push(`${guide} contains unavailable or duplicate copy: ${term}`);
  }
}

const authenticationDocs = readFileSync(join(docsRoot, "authentication.mdx"), "utf8");
for (const term of [
  "Personal access token",
  "bsb_pat_live_",
  "bisibility auth login",
  "X-Bisibility-Project",
]) {
  if (!authenticationDocs.includes(term)) {
    failures.push(`authentication.mdx is missing credential guidance: ${term}`);
  }
}
if (authenticationDocs.includes("The router")) {
  failures.push("authentication.mdx exposes the internal router instead of describing the API.");
}

const apiKeyDocs = readFileSync(join(docsRoot, "api/api-keys.mdx"), "utf8");
for (const term of ["scope", "expires_in_days", "POST /projects/{project_id}/api-keys"]) {
  if (!apiKeyDocs.includes(term)) {
    failures.push(`api/api-keys.mdx is missing current key creation guidance: ${term}`);
  }
}

const agentDocs = readFileSync(join(docsRoot, "agents.mdx"), "utf8");
for (const term of ["personal access token", "project API key", "same permission model"]) {
  if (!agentDocs.includes(term)) {
    failures.push(`agents.mdx is missing consistent credential guidance: ${term}`);
  }
}
if (agentDocs.includes("same router")) {
  failures.push("agents.mdx exposes the internal router instead of describing the API.");
}

const quickstartDocs = readFileSync(join(docsRoot, "quickstart.mdx"), "utf8");
for (const term of ["personal access token", "project API key"]) {
  if (!quickstartDocs.includes(term)) {
    failures.push(`quickstart.mdx is missing credential choice: ${term}`);
  }
}

const selfHostingDocs = readFileSync(join(docsRoot, "self-hosting.mdx"), "utf8");
for (const term of [
  "https://railway.com/deploy/bisibility",
  "### What the template creates",
  "Eight resources are expected.",
  "A completed bootstrap job is not a crashed service.",
  "two one-shot jobs",
  "immutable release",
]) {
  if (!selfHostingDocs.includes(term)) {
    failures.push(`self-hosting.mdx is missing Railway deployment guidance: ${term}`);
  }
}
if (selfHostingDocs.includes("https://railway.com/new/template?template=")) {
  failures.push("self-hosting.mdx uses the repository importer instead of the certified Railway template.");
}

const apiOverviewDocs = readFileSync(join(docsRoot, "api/overview.mdx"), "utf8");
if (apiOverviewDocs.includes("## Client libraries")) {
  failures.push("api/overview.mdx duplicates the SDK section with a client-library section.");
}
if ((apiOverviewDocs.match(/\/sdks\/overview/g) ?? []).length !== 1) {
  failures.push("api/overview.mdx must link to the SDK overview exactly once.");
}

const sdkOverviewDocs = readFileSync(join(docsRoot, "sdks/overview.mdx"), "utf8");
for (const term of ["language-level methods", "HTTP contract", "SDK method reference"]) {
  if (!sdkOverviewDocs.includes(term)) {
    failures.push(`sdks/overview.mdx is missing API/SDK ownership guidance: ${term}`);
  }
}

const sdkMethodsPath = join(docsRoot, "sdks/methods.mdx");
if (!existsSync(sdkMethodsPath)) {
  failures.push("SDK method reference is missing: sdks/methods.mdx");
} else {
  const sdkMethodsDocs = readFileSync(sdkMethodsPath, "utf8");
  for (const term of [
    "list_projects",
    "listProjects",
    "ListProjects",
    "create_project",
    "createProject",
    "CreateProject",
    "add_keywords",
    "addKeywords",
    "AddKeywords",
    "run_rank_check",
    "runRankCheck",
    "RunRankCheck",
    "get_rank_check_result",
    "getRankCheckResult",
    "GetRankCheckResult",
  ]) {
    if (!sdkMethodsDocs.includes(term)) {
      failures.push(`sdks/methods.mdx is missing language method mapping: ${term}`);
    }
  }
}

for (const sdkPage of ["python", "typescript", "go", "mcp"]) {
  const sdkDocs = readFileSync(join(docsRoot, `sdks/${sdkPage}.mdx`), "utf8");
  if (!sdkDocs.includes("/sdks/methods")) {
    failures.push(`sdks/${sdkPage}.mdx does not link to the SDK method reference.`);
  }
}

const canonicalMcpContract = JSON.parse(
  readFileSync(join(root, "lib/mcp/canonical-contract.json"), "utf8"),
);
const mcpFacingFiles = [
  join(root, "README.md"),
  join(docsRoot, "sdks/mcp.mdx"),
  ...walk(join(root, "examples/mcp")).filter((file) => !file.includes("/node_modules/")),
];
const legacyMcpNames = canonicalMcpContract.flatMap(({ name }) => {
  const camelCase = name.replaceAll(/_([a-z0-9])/g, (_, character) => character.toUpperCase());
  return [camelCase, `bisibility_${name}`];
});

for (const file of mcpFacingFiles) {
  const source = readFileSync(file, "utf8");
  for (const legacyName of legacyMcpNames) {
    if (new RegExp(`\\b${escapeRegex(legacyName)}\\b`).test(source)) {
      failures.push(
        `${relative(root, file)} uses legacy MCP tool name ${legacyName}; use the canonical unprefixed snake_case name.`,
      );
    }
  }
}

const publicIdExampleFiles = [
  join(root, "README.md"),
  ...docsFiles,
  ...walk(join(root, "examples")).filter(
    (file) => !file.includes("/node_modules/") && [".md", ".mdx"].includes(extname(file)),
  ),
  ...walk(join(root, "lib/agent-ready/skills")).filter((file) => extname(file) === ".ts"),
];
const concretePublicId = /\b(prj|kw|key|conn)_[A-Za-z0-9]*\d[A-Za-z0-9]*\b/g;

for (const file of publicIdExampleFiles) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(concretePublicId)) {
    const value = match[0];
    if (!/^(?:prj|kw|key|conn)_[a-z][a-z0-9]{23}$/.test(value)) {
      failures.push(
        `${relative(root, file)} uses invalid concrete public id ${value}; use the current prefix plus 24-character payload format.`,
      );
    }
  }
}

const docsConfig = JSON.parse(readFileSync(join(docsRoot, "docs.json"), "utf8"));
for (const redirect of docsConfig.redirects ?? []) {
  const redirectsSdk = redirect.source === "/sdks" || redirect.source.startsWith("/sdks/");
  const targetsApi = redirect.destination === "/api" || redirect.destination.startsWith("/api/");
  if (redirectsSdk && targetsApi) {
    failures.push(`SDK documentation must not redirect to the API reference: ${redirect.source}`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(
  `Documentation content covers ${Object.keys(openapi.paths).length} OpenAPI paths, ${Object.keys(requiredGuides).length} product guides, and existing code paths.`,
);
