import { readFileSync } from "node:fs";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const text = (value) => typeof value === "string" && value.trim().length > 0;
const bytes = (value) => Buffer.byteLength(JSON.stringify(value), "utf8");
function shape(value) {
  if (!value || typeof value !== "object") return { depth: 0, nodes: 1 };
  const children = Object.values(value).map(shape);
  return {
    depth: 1 + Math.max(0, ...children.map((child) => child.depth)),
    nodes: 1 + children.reduce((sum, child) => sum + child.nodes, 0),
  };
}
const report = JSON.parse(readFileSync(process.argv[2], "utf8"));
assert(/^prj_[a-z][a-z0-9]{23}$/.test(report.project_id), "Invalid project id");
assert(report.kind === "ai_prompt_research", "Invalid external report kind");
assert(text(report.title) && report.title.length <= 160, "Invalid title");
assert(text(report.idempotency_key), "Missing stable save key");
assert(bytes(report) < 320 * 1024, "Request exceeds 320 KiB");
for (const [value, limit] of [[report.body, 256 * 1024], [report.provenance, 32 * 1024]]) {
  assert(value && typeof value === "object" && !Array.isArray(value), "Expected JSON object");
  assert(bytes(value) <= limit, "JSON exceeds byte limit");
  const size = shape(value);
  assert(size.depth <= 16 && size.nodes <= 20000, "JSON exceeds structure limits");
}
const classes = new Set(["tracker_sample", "model_suggestion", "keyword_derived", "context_heuristic"]);
const evidence = report.body.evidence;
assert(Array.isArray(evidence) && evidence.length > 0, "Missing evidence");
const ids = new Set(evidence.map((item) => item.id));
assert(ids.size === evidence.length && [...ids].every(text), "Invalid or duplicate evidence ids");
for (const item of evidence) {
  assert(classes.has(item.source_class), "Unknown evidence class");
  assert(text(item.source_tool) && text(item.fact), "Missing source attribution");
}
const prompts = report.body.prompts;
assert(Array.isArray(prompts) && prompts.length > 0 && prompts.length <= 10, "Expected 1-10 prompts");
const normalized = prompts.map((prompt) => prompt.text.trim().replace(/\s+/g, " ").toLowerCase());
assert(new Set(normalized).size === prompts.length, "Duplicate prompt text");
for (const prompt of prompts) {
  assert(text(prompt.text) && text(prompt.topic), "Missing prompt or topic");
  assert(["neutral", "comparative", "branded"].includes(prompt.category), "Invalid intent");
  assert(classes.has(prompt.source_class), "Missing prompt evidence class");
  assert(prompt.popularity === null, "This proposal has no verified popularity measurement");
  assert(["already_tracked", "proposed"].includes(prompt.disposition), "Missing disposition");
  assert(Array.isArray(prompt.evidence_ids) && prompt.evidence_ids.length > 0, "Missing evidence links");
  assert(prompt.evidence_ids.every((id) => ids.has(id)), "Dangling evidence reference");
  for (const field of ["business_rationale", "confidence", "uncertainty", "verification"])
    assert(text(prompt[field]), `Missing ${field}`);
}
assert(report.provenance.skill === "ai-prompt-research", "Invalid skill provenance");
assert(Array.isArray(report.provenance.evidence_ids), "Missing provenance ids");
assert(report.provenance.evidence_ids.length === ids.size &&
  report.provenance.evidence_ids.every((id) => ids.has(id)), "Provenance ids mismatch");
console.log("Prompt research report structure valid; evidence truth and approval are not verified.");
