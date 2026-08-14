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

const versionedCloudImportRoot = join(root, "app", "api", "v1", "cloud", "import");
const unversionedCloudImportRoot = join(root, "app", "api", "cloud", "import");
const unversionedCloudImportPath = "/api/cloud" + "/import";
if (!existsSync(versionedCloudImportRoot)) {
  failures.push("The canonical app/api/v1/cloud/import route tree is missing.");
}
if (existsSync(unversionedCloudImportRoot)) {
  failures.push("The unversioned cloud-import route tree must not exist.");
}

const contractSourceExtensions = new Set([
  ".cjs",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mdx",
  ".mjs",
  ".ts",
  ".tsx",
]);
for (const directory of ["app", "components", "docs", "lib", "scripts"]) {
  for (const file of walk(join(root, directory))) {
    if (!contractSourceExtensions.has(extname(file))) continue;
    if (readFileSync(file, "utf8").includes(unversionedCloudImportPath)) {
      failures.push(
        `${relative(root, file)} references forbidden unversioned path ${unversionedCloudImportPath}.`,
      );
    }
  }
}

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

function markedSection(source, start, end, label) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    failures.push(`markets.mdx is missing the ${label} catalog markers.`);
    return "";
  }
  return source.slice(startIndex + start.length, endIndex);
}

const marketsDocs = readFileSync(join(docsRoot, "markets.mdx"), "utf8");
const marketsSource = readFileSync(join(root, "lib/serp/markets.ts"), "utf8");
const languageCatalogSource = readFileSync(
  join(root, "lib/serp/generated/serp-language-catalog.ts"),
  "utf8",
);
const languageCatalog = [...languageCatalogSource.matchAll(/\{ code: "([^"]+)", label: "([^"]+)" \}/g)].map(
  ([, code, label]) => ({ code, label }),
);
const languageLabels = new Map(languageCatalog.map(({ code, label }) => [code, label]));
const expectedMarkets = [
  ...marketsSource.matchAll(/market\("([^"]+)", "([a-z]{2})", "([^"]+)"/g),
].map(([, country, countryCode, languageCode]) => ({
  country,
  countryCode: countryCode.toUpperCase(),
  languageCode,
  languageLabel: languageLabels.get(languageCode),
}));
const marketSection = markedSection(
  marketsDocs,
  "<!-- supported-market-catalog:start -->",
  "<!-- supported-market-catalog:end -->",
  "supported market",
);
const documentedMarkets = [
  ...marketSection.matchAll(
    /^\| ([^|]+) \| `([A-Z]{2})` \| ([^(|]+) \(`([^`]+)`\) \|$/gm,
  ),
].map(([, country, countryCode, languageLabel, languageCode]) => ({
  country: country.trim(),
  countryCode,
  languageCode,
  languageLabel: languageLabel.trim(),
}));
if (JSON.stringify(documentedMarkets) !== JSON.stringify(expectedMarkets)) {
  failures.push("markets.mdx supported countries and defaults do not match lib/serp/markets.ts.");
}

const languageSection = markedSection(
  marketsDocs,
  "<!-- supported-language-catalog:start -->",
  "<!-- supported-language-catalog:end -->",
  "supported language",
);
const documentedLanguages = [
  ...languageSection.matchAll(/([^·\n]+?) \(`([^`]+)`\)(?: ·|$)/gm),
].map(([, label, code]) => ({ code, label: label.trim() }));
if (JSON.stringify(documentedLanguages) !== JSON.stringify(languageCatalog)) {
  failures.push(
    "markets.mdx supported languages do not match the generated SERP language catalog.",
  );
}

const marketsDocumentationContract = {
  "api/checks.mdx": ["location-language market", "`location_key`"],
  "api/competitors.mdx": ["location and language pair", "`ES@en`"],
  "api/keyword-research.mdx": [
    "country scope",
    "`keyword_overview`",
    "entire metrics bundle",
    "does not substitute another country's data",
  ],
  "api/keywords.mdx": ["optional `@language` qualifier", "`language_code`", "`language_label`"],
  "guides/competitors.mdx": ["location, language, and device", "Spain in English"],
  "markets.mdx": [
    "A market is a location and language pair",
    "Suggestions are a convenience",
    "shows Research metrics as `n/a`",
    "all-or-nothing",
  ],
};
for (const [page, requiredTerms] of Object.entries(marketsDocumentationContract)) {
  const source = readFileSync(join(docsRoot, page), "utf8");
  for (const term of requiredTerms) {
    if (!source.includes(term)) {
      failures.push(`${page} is missing the markets contract: ${term}`);
    }
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

const selfHostingPagePaths = [
  "self-hosting.mdx",
  "self-hosting/docker.mdx",
  "self-hosting/upgrades.mdx",
  "self-hosting/railway.mdx",
  "self-hosting/temporal.mdx",
  "self-hosting/configuration.mdx",
  "self-hosting/operations.mdx",
];
const selfHostingPages = new Map();
for (const page of selfHostingPagePaths) {
  const pagePath = join(docsRoot, page);
  if (!existsSync(pagePath)) {
    failures.push(`Self-hosting page is missing: docs/${page}`);
    continue;
  }
  const content = readFileSync(pagePath, "utf8");
  selfHostingPages.set(page, content);
  if (page !== "self-hosting.mdx") {
    const opening = content.slice(0, 600);
    if (!opening.includes("[Production checklist](/self-hosting#production-checklist)")) {
      failures.push(`docs/${page} must link to the production checklist at the top.`);
    }
  }
}

const selfHostingDocs = [...selfHostingPages.values()].join("\n");
for (const term of [
  "https://bisibility.com/deploy/railway",
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
if (selfHostingDocs.includes("https://railway.com/deploy/")) {
  failures.push("self-hosting.mdx bypasses the stable Bisibility deployment redirect.");
}

const selfHostingHub = selfHostingPages.get("self-hosting.mdx") ?? "";
for (const compatibilityCopy of [
  ["## Moved", "sections"].join(" "),
  ["Existing bookmarks", "remain valid here"].join(" "),
]) {
  if (selfHostingHub.includes(compatibilityCopy)) {
    failures.push(`self-hosting.mdx restores pre-stable compatibility copy: ${compatibilityCopy}`);
  }
}
for (const term of [
  "## Production topology",
  "| Web/API | Repository `Dockerfile` | Yes |",
  "[Production topology](/self-hosting#production-topology)",
]) {
  if (!selfHostingHub.includes(term)) {
    failures.push(`self-hosting.mdx does not expose the production service contract: ${term}`);
  }
}

const selfHostingUpgrades = selfHostingPages.get("self-hosting/upgrades.mdx") ?? "";
const legacyUpgradeAnchors = [
  "1-back-up-postgresql",
  "2-check-the-port-change",
  "3-fetch-v020",
  "4-keep-deliberate-host-local-database-access",
  "5-build-and-start-the-release",
  "6-verify-the-upgrade",
  "7-roll-back",
];
if (
  !selfHostingUpgrades.includes(
    '<span id="upgrade-from-v010-to-v020"></span>\n\n## Upgrade from v0.1.0 to v0.2.0',
  )
) {
  failures.push("self-hosting/upgrades.mdx is missing #upgrade-from-v010-to-v020.");
}
for (const anchor of legacyUpgradeAnchors) {
  if (!selfHostingUpgrades.includes(`id="${anchor}"`)) {
    failures.push(`self-hosting/upgrades.mdx is missing the restored legacy anchor #${anchor}.`);
  }
}
for (const term of [
  "<AccordionGroup>",
  "bisibility-v0.1.0-before-v0.2.0.dump",
  "docker compose -f docker-compose.yml -f docker-compose.debug.yml up -d --build",
  "docker compose exec -T postgres pg_restore",
]) {
  if (!selfHostingUpgrades.includes(term)) {
    failures.push(`self-hosting/upgrades.mdx is missing legacy upgrade guidance: ${term}`);
  }
}

const selfHostingOperations = selfHostingPages.get("self-hosting/operations.mdx") ?? "";
if (selfHostingOperations.includes("\nWarning: a depth larger than your real chain")) {
  failures.push("The XFF depth warning must be inside the adjacent Warning component.");
}
if (
  !selfHostingOperations.includes(
    "<Warning>\nA depth larger than your real chain reads a client-supplied entry.",
  )
) {
  failures.push("The XFF Warning component is missing the depth-mismatch risk.");
}

const selfHostingConfiguration = selfHostingPages.get("self-hosting/configuration.mdx") ?? "";
if (
  !selfHostingConfiguration.includes(
    "| `SELF_HOSTED_ALLOW_INDEXING` | Self-hosted instances serve restrictive `robots.txt` and no `sitemap.xml` or `llms.txt` by default.",
  )
) {
  failures.push("SELF_HOSTED_ALLOW_INDEXING must own the robots and sitemap behavior in its row.");
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
