import { getMcpToolDefinitions } from "@/lib/mcp/definitions";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import { expect, it } from "vitest";
import { researchWorkspacePaths } from "./openapi-research-workspace";

it("emits research schemas without undefined JSON schema keywords", () => {
  const paths = researchWorkspacePaths();
  const invalid: string[] = [];
  const visit = (value: unknown, path: string) => {
    if (value === undefined) invalid.push(path);
    else if (value && typeof value === "object")
      for (const [key, child] of Object.entries(value)) visit(child, `${path}.${key}`);
  };
  visit(paths, "paths");
  expect(invalid).toEqual([]);
});

it("publishes executable prompt model syntax and cap constraints", () => {
  const operation = researchWorkspacePaths()["/projects/{project_id}/prompt-explorer"].post as {
    requestBody: { content: { "application/json": { schema: object } } };
  };
  const validate = new AjvJsonSchemaValidator().getValidator(
    operation.requestBody.content["application/json"].schema as never,
  );
  const base = { brand: "Acme", domain: "acme.com", prompt: "Which tools?", max_cost_cents: 60 };
  expect(validate(base).valid).toBe(true);
  expect(validate({ ...base, models: ["gpt-new-model"] }).valid).toBe(true);
  for (const change of [
    { models: ["invalid/model"] },
    { models: ["gpt-4.1-mini", "gpt-4.1-mini"] },
    { max_cost_cents: -1 },
    { max_cost_cents: 1001 },
  ])
    expect(validate({ ...base, ...change }).valid).toBe(false);
});

it("scopes the published provider domain limit to domain searches, including the omitted default", () => {
  const paths = researchWorkspacePaths();
  const tools = getMcpToolDefinitions();
  const domain = `${"a".repeat(50)}.${"b".repeat(12)}.example.com`;
  for (const mode of ["visibility", "prompt"] as const) {
    const path = mode === "visibility" ? "ai-visibility" : "prompt-explorer";
    const operation = paths[`/projects/{project_id}/${path}`].post as {
      requestBody: { content: { "application/json": { schema: object } } };
    };
    const tool = tools.find(
      (item) =>
        item.name === (mode === "visibility" ? "analyze_ai_visibility" : "compare_ai_prompts"),
    );
    if (!tool) throw new Error("Research tool missing");
    for (const [schema, project] of [
      [operation.requestBody.content["application/json"].schema, {}],
      [tool.inputSchema, { project_id: "prj_abcdefghijklmnopqrstuvwx" }],
    ] as const) {
      const validate = new AjvJsonSchemaValidator().getValidator(schema as never);
      const base = { ...project, brand: "Example", domain, max_cost_cents: 20 };
      if (mode === "prompt") expect(validate({ ...base, prompt: "q" }).valid).toBe(true);
      else {
        expect(validate({ ...base, target_type: "brand" }).valid).toBe(true);
        expect(validate({ ...base, target_type: "domain" }).valid).toBe(false);
        expect(validate(base).valid).toBe(false);
        expect(validate({ ...base, domain: "example.com" }).valid).toBe(true);
        const bare = `${"a".repeat(50)}.${"b".repeat(8)}.com`;
        expect(bare).toHaveLength(63);
        expect(validate({ ...base, domain: `www.${bare}` }).valid).toBe(true);
        expect(validate({ ...base, domain: `${bare}x` }).valid).toBe(false);
        expect(validate({ ...base, domain: `www.${bare}x` }).valid).toBe(false);
      }
    }
  }
});
