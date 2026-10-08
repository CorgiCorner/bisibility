import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import { pathToFileURL } from "node:url";

const publicId = (prefix, value) =>
  typeof value === "string" &&
  value.length === 28 &&
  (prefix === "prj"
    ? /^prj_[a-z][a-z0-9]{23}$/.test(value)
    : prefix === "agr" && /^agr_[a-z][a-z0-9]{23}$/.test(value));
const types = new Set([
  "http_crawl",
  "saved_ranking",
  "first_party",
  "observed_dataset",
  "synthetic_prompt_test",
]);
const tools = new Set([
  "run_site_audit",
  "get_site_audit",
  "list_keywords",
  "get_rank_history",
  "list_search_performance_query_stats",
  "get_agent_report",
  "analyze_ai_visibility",
  "compare_ai_prompts",
]);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const text = (value) => typeof value === "string" && value.trim().length > 0;
const date = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T/.test(value) &&
  Number.isFinite(Date.parse(value));

export function safeSourceUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function boundedObject(value, maxBytes) {
  assert(value && Object.getPrototypeOf(value) === Object.prototype, "Expected JSON object");
  const pending = [{ value, depth: 0 }];
  const seen = new Set();
  let nodes = 0;
  while (pending.length) {
    const item = pending.pop();
    assert(++nodes <= 20000 && item.depth <= 16, "JSON node/depth limit exceeded");
    const current = item.value;
    if (current === null || ["string", "boolean"].includes(typeof current)) continue;
    if (typeof current === "number") {
      assert(Number.isFinite(current), "Non-finite JSON number");
      continue;
    }
    assert(typeof current === "object" && !seen.has(current), "Invalid or cyclic JSON value");
    assert(
      Array.isArray(current) || Object.getPrototypeOf(current) === Object.prototype,
      "Non-JSON object",
    );
    seen.add(current);
    for (const child of Object.values(current))
      pending.push({ value: child, depth: item.depth + 1 });
  }
  assert(Buffer.byteLength(JSON.stringify(value)) <= maxBytes, "JSON byte limit exceeded");
}

function validateUrlFields(object) {
  for (const [key, value] of Object.entries(object)) {
    if (value === null) continue;
    if (/(?:^url$|_url$|Url$)/.test(key)) assert(safeSourceUrl(value), "Unsafe source URL field");
    if (/(?:^urls$|_urls$|Urls$)/.test(key)) {
      assert(Array.isArray(value) && value.every(safeSourceUrl), "Unsafe source URL list");
    }
    if (typeof value === "object") validateUrlFields(value);
  }
}

export function validateReport(payload) {
  assert(payload && typeof payload === "object", "Expected payload object");
  const allowed = ["project_id", "kind", "title", "body", "provenance", "idempotency_key"];
  assert(
    Object.keys(payload).every((key) => allowed.includes(key)),
    "Unsupported report field",
  );
  assert(publicId("prj", payload.project_id), "Invalid project ID");
  assert(payload.kind === "seo_audit", "Use external kind seo_audit");
  assert(text(payload.title) && payload.title.length <= 160, "Invalid title");
  if (payload.idempotency_key !== undefined)
    assert(text(payload.idempotency_key), "Invalid retry key");
  boundedObject(payload.body, 256 * 1024);
  boundedObject(payload.provenance, 32 * 1024);
  validateUrlFields(payload.body);
  validateUrlFields(payload.provenance);
  assert(Buffer.byteLength(JSON.stringify(payload)) <= 320 * 1024, "Request byte limit exceeded");
  const body = payload.body;
  assert(body.version === 1 && text(body.summary), "Missing report version/summary");
  for (const key of ["context", "coverage", "visibility", "costs"]) {
    assert(
      body[key] && typeof body[key] === "object" && !Array.isArray(body[key]),
      `Missing ${key}`,
    );
  }
  assert(Array.isArray(body.checked), "Missing checked candidates");
  assert(Array.isArray(body.evidence) && body.evidence.length > 0, "Missing evidence");
  const evidence = new Map();
  for (const row of body.evidence) {
    assert(text(row.id) && !evidence.has(row.id), "Duplicate/missing evidence ID");
    assert(types.has(row.type) && tools.has(row.source_tool), "Unsupported evidence type/tool");
    assert(row.url === null || safeSourceUrl(row.url), "Unsafe source URL");
    assert(row.observed_at === null || date(row.observed_at), "Invalid observation date");
    assert(date(row.retrieved_at) && text(row.fact), "Missing retrieval date/fact");
    if (row.type === "synthetic_prompt_test") {
      assert(
        ["get_agent_report", "compare_ai_prompts"].includes(row.source_tool),
        "Synthetic source mismatch",
      );
    }
    if (row.type === "observed_dataset") {
      assert(
        ["get_agent_report", "analyze_ai_visibility"].includes(row.source_tool),
        "Observed source mismatch",
      );
    }
    evidence.set(row.id, row);
  }
  assert(
    Array.isArray(body.recommendations) && body.recommendations.length <= 3,
    "Expected up to three actions",
  );
  for (const [index, item] of body.recommendations.entries()) {
    assert(item.priority === index + 1, "Actions must be ordered by priority");
    assert(["technical", "content", "visibility"].includes(item.category), "Invalid category");
    for (const key of ["action", "rationale", "benefit", "effort", "uncertainty", "verification"]) {
      assert(text(item[key]), `Missing action ${key}`);
    }
    assert(["low", "medium", "high"].includes(item.confidence), "Invalid confidence");
    assert(Array.isArray(item.urls) && item.urls.every(safeSourceUrl), "Unsafe affected URL");
    assert(
      Array.isArray(item.evidence_ids) && item.evidence_ids.length > 0,
      "Missing action evidence",
    );
    assert(
      item.evidence_ids.every((id) => evidence.has(id)),
      "Dangling evidence reference",
    );
    if (item.category === "visibility" && item.confidence === "high") {
      assert(
        item.evidence_ids.some((id) => evidence.get(id).type === "observed_dataset"),
        "High visibility confidence needs observed data",
      );
    }
  }
  assert(
    payload.provenance.skill === "seo-audit" && text(payload.provenance.skill_version),
    "Missing skill provenance",
  );
  assert(
    text(payload.provenance.agent) && date(payload.provenance.audited_at),
    "Missing agent/date provenance",
  );
  return payload;
}

export function reportLink(origin, projectId, reportId) {
  const url = new URL(origin);
  assert(
    url.protocol === "https:" && !url.username && !url.password,
    "Use trusted HTTPS app origin",
  );
  assert(url.pathname === "/" && !url.search && !url.hash, "Expected app origin without path");
  assert(!isIP(url.hostname) && url.hostname !== "localhost", "Use configured public app hostname");
  assert(publicId("prj", projectId) && publicId("agr", reportId), "Invalid report link IDs");
  return `${url.origin}/app/${projectId}/agent-reports/${reportId}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assert(process.argv.length === 3, "Usage: node validate-report.mjs <payload.json>");
    validateReport(JSON.parse(readFileSync(process.argv[2], "utf8")));
    process.stdout.write("Valid SEO audit payload (local validation only).\n");
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
