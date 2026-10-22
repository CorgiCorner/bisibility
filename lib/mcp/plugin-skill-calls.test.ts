import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import type { JsonSchemaType } from "@modelcontextprotocol/sdk/validation/types";
import { describe, expect, it } from "vitest";
import { getMcpToolDefinitions } from "./definitions";

type Document = { path: string; text: string };
type Call = { tool: string; arguments: Record<string, unknown> };
const root = join(process.cwd(), "plugins/bisibility");
const paidTools = [
  "analyze_domain_overview",
  "load_domain_overview_keywords",
  "load_domain_overview_pages",
  "load_domain_overview_history",
  "estimate_domain_overview_cost",
  "analyze_ai_visibility",
  "compare_ai_prompts",
  "research_keywords",
  "analyze_backlinks",
  "get_keyword_metrics",
  "estimate_backlinks_cost",
  "estimate_keyword_research_cost",
  "list_ranked_keyword_suggestions",
  "run_rank_check",
];
const definitions = new Map(getMcpToolDefinitions().map((tool) => [tool.name, tool]));
// The hosted dispatcher validates IDs and REST bodies, not the complete input schema.
const validator = new AjvJsonSchemaValidator();
const envelope = validator.getValidator<Call>({
  type: "object",
  properties: { tool: { type: "string" }, arguments: { type: "object" } },
  required: ["tool", "arguments"],
  additionalProperties: false,
});
const validators = new Map(
  [...definitions].map(([name, tool]) => [
    name,
    validator.getValidator(tool.inputSchema as JsonSchemaType),
  ]),
);

function markdownFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? markdownFiles(path) : entry.name.endsWith(".md") ? [path] : [];
  });
}

const documents = markdownFiles(root).map((path) => ({
  path: relative(root, path).split(sep).join("/"),
  text: readFileSync(path, "utf8"),
}));
const blockPattern = /^```json mcp-call\r?\n([\s\S]*?)^```[ \t]*$/gm;

function calls(text: string): Call[] {
  return [...text.matchAll(blockPattern)].map((match) => {
    const parsed: unknown = JSON.parse(match[1]);
    const result = envelope(parsed);
    if (!result.valid) throw new Error(`Invalid mcp-call envelope: ${result.errorMessage}`);
    return result.data;
  });
}

function validateCall(call: Call) {
  const definition = definitions.get(call.tool);
  const validate = validators.get(call.tool);
  if (!definition || !validate) throw new Error(`Unknown MCP tool: ${call.tool}`);
  const result = validate(call.arguments);
  if (!result.valid) throw new Error(`${call.tool}: ${result.errorMessage}`);
  // Legacy schemas allow extra properties; examples must still use documented arguments.
  const properties = definition.inputSchema.properties as Record<string, unknown>;
  for (const key of Object.keys(call.arguments)) {
    if (!Object.hasOwn(properties, key)) {
      throw new Error(`${call.tool}: undocumented argument ${key}`);
    }
  }
}

function validateDocuments(input: Document[]) {
  const skills = new Map<string, { prose: string; tools: Set<string>; prohibited: Set<string> }>();
  for (const document of input) {
    const examples = calls(document.text);
    for (const call of examples) {
      try {
        validateCall(call);
      } catch (error) {
        throw new Error(`${document.path}: ${String(error)}`);
      }
    }
    const skill = /^skills\/([^/]+)\//.exec(document.path)?.[1];
    if (!skill) continue;
    const evidence = skills.get(skill) ?? {
      prose: "",
      tools: new Set<string>(),
      prohibited: new Set<string>(),
    };
    const prose = document.text.replace(/^```[^\n]*\n[\s\S]*?^```[ \t]*$/gm, "");
    evidence.prose += `\n${prose}`;
    for (const [, tool] of prose.matchAll(/<!-- paid-tool-prohibited: ([a-z_]+) -->/g)) {
      evidence.prohibited.add(tool);
    }
    for (const call of examples) evidence.tools.add(call.tool);
    skills.set(skill, evidence);
  }
  for (const [skill, evidence] of skills) {
    for (const tool of paidTools) {
      if (evidence.prohibited.has(tool)) {
        if (evidence.tools.has(tool))
          throw new Error(`${skill}: prohibited tool has executable example: ${tool}`);
        if (!evidence.prose.includes(`Do not call \`${tool}\``))
          throw new Error(`${skill}: missing explicit prohibition: ${tool}`);
        const remaining = evidence.prose
          .replaceAll(`<!-- paid-tool-prohibited: ${tool} -->`, "")
          .replaceAll(`Do not call \`${tool}\``, "")
          .replaceAll(`Stop before calling \`${tool}\``, "");
        if (new RegExp(`\\b${tool}\\b`).test(remaining)) {
          throw new Error(`${skill}: prohibited tool has an affirmative mention: ${tool}`);
        }
        continue;
      }
      if (new RegExp(`\\b${tool}\\b`).test(evidence.prose) && !evidence.tools.has(tool)) {
        throw new Error(`${skill}: missing mcp-call example for ${tool}`);
      }
    }
  }
}

const project_id = "prj_a00000000000000000000000";
const backlink: Call = {
  tool: "analyze_backlinks",
  arguments: { project_id, target: "example.org", estimate_only: true },
};

describe("plugin skill MCP example calls", () => {
  it("validates every example and covers every paid tool named by each skill", () => {
    expect(() => validateDocuments(documents)).not.toThrow();
  });

  it("accepts an explicit cache-only backlink cap", () => {
    expect(() =>
      validateCall({ ...backlink, arguments: { ...backlink.arguments, max_cost_cents: 0 } }),
    ).not.toThrow();
  });

  it.each([
    {
      name: "negative backlink cap",
      call: { ...backlink, arguments: { ...backlink.arguments, max_cost_cents: -1 } },
      message: "analyze_backlinks: data/max_cost_cents must be >= 0",
    },
    {
      name: "invented argument",
      call: { ...backlink, arguments: { ...backlink.arguments, invented_argument: true } },
      message: "analyze_backlinks: undocumented argument invented_argument",
    },
    {
      name: "unknown tool",
      call: { ...backlink, tool: "invented_tool" },
      message: "Unknown MCP tool: invented_tool",
    },
  ])("rejects $name", ({ call, message }) => {
    expect(() => validateCall(call)).toThrow(message);
  });

  it("permits an explicit paid-tool prohibition without teaching its execution", () => {
    const document = {
      path: "skills/read-only/references/workflow.md",
      text: "Do not call `run_rank_check`.\n<!-- paid-tool-prohibited: run_rank_check -->",
    };
    expect(() => validateDocuments([document])).not.toThrow();
    expect(() =>
      validateDocuments([
        {
          ...document,
          text:
            document.text +
            "\n```json mcp-call\n" +
            JSON.stringify({
              tool: "run_rank_check",
              arguments: {
                project_id,
                keyword_id: "kw_a00000000000000000000000",
                max_cost_cents: 1,
              },
            }) +
            "\n```",
        },
      ]),
    ).toThrow("prohibited tool has executable example");
  });

  it("rejects affirmative instructions elsewhere and markers hidden in code fences", () => {
    const path = "skills/read-only/references/workflow.md";
    const text = "Do not call `run_rank_check`.\n<!-- paid-tool-prohibited: run_rank_check -->";
    expect(() =>
      validateDocuments([
        { path, text },
        { path: "skills/read-only/other.md", text: "After approval call `run_rank_check`." },
      ]),
    ).toThrow("affirmative mention");
    expect(() =>
      validateDocuments([
        {
          path,
          text: "Do not call `run_rank_check`.\n```text\n<!-- paid-tool-prohibited: run_rank_check -->\n```",
        },
      ]),
    ).toThrow("missing mcp-call example");
  });

  it("rejects removal of the only example for a named paid tool", () => {
    const changed = documents.map((document) => ({
      ...document,
      text: document.text.replace(blockPattern, (block, json: string) =>
        (JSON.parse(json) as Call).tool === "estimate_backlinks_cost" ? "" : block,
      ),
    }));
    expect(() => validateDocuments(changed)).toThrow(
      "competitor-analysis: missing mcp-call example for estimate_backlinks_cost",
    );
  });
});
