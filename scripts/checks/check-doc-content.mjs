#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import {
  checkDomainOverviewContract,
  checkSlackPreviewContract,
  findContractSourceReferences,
  walk,
} from "./doc-content-helpers.mjs";
import { checkMarketsContract } from "./doc-content-markets.mjs";
import { checkSelfHostingContract } from "./doc-content-self-hosting.mjs";
import { checkSdkContract } from "./doc-content-sdks.mjs";

const root = process.cwd();
const docsRoot = join(root, "docs");

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

for (const file of findContractSourceReferences(root, unversionedCloudImportPath)) {
  failures.push(`${file} references forbidden unversioned path ${unversionedCloudImportPath}.`);
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

failures.push(
  ...checkSlackPreviewContract(
    ["README.md", "docs/guides/alerts.mdx", "docs/api/alert-rules.mdx", "docs/architecture.mdx"].map(
      (label) => ({ label, source: readFileSync(join(root, label), "utf8") }),
    ),
  ),
);

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
  "guides/alerts.mdx": [
    "Position drop",
    "WEBHOOK_ALLOW_PRIVATE_NETWORK",
    "alert.fired",
  ],
  "guides/analytics.mdx": ["TRAFFIC_SYNC_ENABLED", "TRAFFIC_SNAPSHOT_RETENTION_DAYS", "28-day"],
  "guides/competitors.mdx": ["keyword cap", "share of voice", "CSV"],
  "guides/migration.mdx": ["single-use", "mig_", "Instance import"],
  "guides/saved-views.mdx": ["location/device lens", "48 characters", "wrong-URL"],
  "guides/teams.mdx": ["seven days", "email provider", "`member`"],
};

const forbiddenGuideTerms = {
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

failures.push(...checkMarketsContract(root, docsRoot));

for (const [guide, forbiddenTerms] of Object.entries(forbiddenGuideTerms)) {
  const guideText = readFileSync(join(docsRoot, guide), "utf8");
  for (const term of forbiddenTerms) {
    if (guideText.includes(term)) failures.push(`${guide} contains unavailable or duplicate copy: ${term}`);
  }
}

const authenticationDocs = readFileSync(join(docsRoot, "authentication.mdx"), "utf8");
const projectSelectionSentence = "Selection precedence is: `{project_id}` path parameter, X-Bisibility-Project header, project query parameter, then inference when the PAT owner belongs to exactly one project.";
for (const term of ["Personal access token", "bsb_pat_live_", "bisibility auth login", projectSelectionSentence]) {
  if (!authenticationDocs.includes(term)) {
    failures.push(`authentication.mdx is missing credential guidance: ${term}`);
  }
}
if (!authenticationDocs.includes("## Project selection")) failures.push("authentication.mdx must expose the canonical project-selection anchor.");
for (const page of ["api/overview.mdx", "api/personal-access-tokens.mdx"]) {
  if (!readFileSync(join(docsRoot, page), "utf8").includes("/authentication#project-selection")) failures.push(`${page} must link to the canonical project-selection contract.`);
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

failures.push(...checkSelfHostingContract(root, docsRoot));

failures.push(...checkSdkContract(root, docsRoot));

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

const readmeSource = readFileSync(join(root, "README.md"), "utf8");
for (const failure of checkDomainOverviewContract(readmeSource)) {
  failures.push(failure);
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
