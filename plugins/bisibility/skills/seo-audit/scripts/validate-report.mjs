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
const classForType = {
  http_crawl: "site_crawl",
  saved_ranking: "google_observation",
  first_party: "search_console_history",
  observed_dataset: "observed_ai",
  synthetic_prompt_test: "synthetic_prompt",
};
const classes = new Set(Object.values(classForType));
const calendarDate = (value) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));
const tools = new Set([
  "run_site_audit",
  "get_site_audit",
  "list_keywords",
  "get_rank_history",
  "list_search_performance_query_stats",
  "get_agent_report",
]);
const sourceTools = new Set([
  ...tools,
  "list_projects",
  "get_project",
  "get_project_context",
  "list_site_audits",
  "list_agent_reports",
  "list_search_index_sitemaps",
  "get_search_index_sitemap",
  "inspect_search_index_urls",
  "get_page_indexing_report",
  "list_page_indexing_urls",
  "get_page_indexing_settings",
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

function validateSourceTools(object, message = "Unsupported source tool") {
  for (const [key, value] of Object.entries(object)) {
    if (key === "source_tool") assert(sourceTools.has(value), message);
    if (key === "source_tools") {
      assert(
        Array.isArray(value) && value.every((tool) => sourceTools.has(tool)),
        message,
      );
    }
    if (value && typeof value === "object") validateSourceTools(value, message);
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
  validateSourceTools(payload.provenance, "Unsupported provenance tool");
  assert(Buffer.byteLength(JSON.stringify(payload)) <= 320 * 1024, "Request byte limit exceeded");
  const body = payload.body;
  assert(body.version === 1 && text(body.summary), "Missing report version/summary");
  for (const key of [
    "context",
    "coverage",
    "search_console_history",
    "google_observation",
    "site_crawl",
    "visibility",
    "costs",
  ]) {
    assert(
      body[key] && typeof body[key] === "object" && !Array.isArray(body[key]),
      `Missing ${key}`,
    );
  }
  for (const key of ["search_console_history", "google_observation", "site_crawl"]) {
    assert(text(body[key].state), `Missing ${key} section state`);
  }
  assert(Array.isArray(body.checked), "Missing checked candidates");
  assert(Array.isArray(body.evidence) && body.evidence.length > 0, "Missing evidence");
  const evidence = new Map();
  for (const row of body.evidence) {
    assert(text(row.id) && !evidence.has(row.id), "Duplicate/missing evidence ID");
    assert(types.has(row.type) && tools.has(row.source_tool), "Unsupported evidence type/tool");
    assert(row.class === classForType[row.type] && classes.has(row.class), "Evidence class mismatch");
    if (row.class === "search_console_history") {
      assert(
        row.source_tool === "list_search_performance_query_stats",
        "Search Console tool mismatch",
      );
      assert(
        row.period &&
          calendarDate(row.period.start_date) &&
          calendarDate(row.period.end_date) &&
          text(row.aggregation),
        "Missing Search Console date range or aggregation",
      );
    }
    if (row.class === "google_observation") {
      assert(
        ["list_keywords", "get_rank_history"].includes(row.source_tool),
        "Rank observation tool mismatch",
      );
      assert(text(row.market) && text(row.device), "Missing market or device");
    }
    assert(row.url === null || safeSourceUrl(row.url), "Unsafe source URL");
    assert(row.observed_at === null || date(row.observed_at), "Invalid observation date");
    assert(date(row.retrieved_at) && text(row.fact), "Missing retrieval date/fact");
    if (row.type === "synthetic_prompt_test") {
      assert(
        row.source_tool === "get_agent_report",
        "Synthetic source mismatch",
      );
    }
    if (row.type === "observed_dataset") {
      assert(
        row.source_tool === "get_agent_report",
        "Observed source mismatch",
      );
    }
    if (["observed_dataset", "synthetic_prompt_test"].includes(row.type))
      assert(publicId("agr", row.report_id), "Invalid saved AI report ID");
    evidence.set(row.id, row);
  }
  validateSourceTools(body);
  assert(
    Array.isArray(body.recommendations) && body.recommendations.length <= 3,
    "Expected up to three actions",
  );
  for (const [index, item] of body.recommendations.entries()) {
    assert(item.priority === index + 1, "Actions must be ordered by priority");
    assert(["technical", "content", "visibility"].includes(item.category), "Invalid category");
    assert(classes.has(item.evidence_class), "Missing evidence class");
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
    assert(
      item.evidence_ids.every((id) => evidence.get(id).class === item.evidence_class),
      "Finding mixes evidence classes",
    );
    if (item.evidence_class === "search_console_history") {
      assert(item.category !== "visibility", "Search Console history is not current visibility");
    }
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
