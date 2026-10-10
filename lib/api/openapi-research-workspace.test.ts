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
