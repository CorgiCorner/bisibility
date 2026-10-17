import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { externalAgentReportSchema } from "@/lib/agent-reports/model";
import { describe, expect, it } from "vitest";
import { dispatchResearchWorkspaceTool } from "./research-workspace-tools";
import type { JsonObject } from "./types";

const root = join(process.cwd(), "plugins/bisibility/skills");
const fixtures = readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
  const references = join(root, entry.name, "references");
  const path = join(references, "example-report.json");
  return entry.isDirectory() && existsSync(path)
    ? [{ slug: entry.name, path, report: readFileSync(join(references, "report.md"), "utf8") }]
    : [];
});

function documentedKind(report: string): string {
  const kinds = [
    ...report.replaceAll("`", "").matchAll(/\b(?:kind:\s*|Use kind\s+)([a-z][a-z0-9_]*)/g),
  ].map((match) => match[1]);
  const unique = [...new Set(kinds)];
  if (unique.length !== 1) throw new Error("report.md must name exactly one external kind");
  return unique[0];
}

function shape(value: unknown): { depth: number; nodes: number } {
  if (!value || typeof value !== "object") return { depth: 0, nodes: 1 };
  const children = Object.values(value).map(shape);
  return {
    depth: children.length ? 1 + Math.max(...children.map((child) => child.depth)) : 0,
    nodes: 1 + children.reduce((total, child) => total + child.nodes, 0),
  };
}

const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");
const readFixture = (path: string): JsonObject => JSON.parse(readFileSync(path, "utf8"));

function validateFixture(payload: JsonObject, report: string) {
  const { project_id: projectId, idempotency_key: key, ...resource } = payload;
  const parsed = externalAgentReportSchema.parse(resource);
  const expectedKind = documentedKind(report);
  if (parsed.kind !== expectedKind) {
    throw new Error(`Fixture kind ${parsed.kind} does not match report.md kind ${expectedKind}`);
  }
  expect(projectId).toMatch(/^prj_[a-z][a-z0-9]{23}$/);
  expect(key).toEqual(expect.any(String));
  expect((key as string).length).toBeGreaterThan(0);
  expect(bytes(payload)).toBeLessThan(64 * 1024);
  expect(bytes(payload)).toBeLessThanOrEqual(320 * 1024);
  for (const [value, limit] of [
    [parsed.body, 256 * 1024],
    [parsed.provenance, 32 * 1024],
  ] as const) {
    expect(bytes(value)).toBeLessThanOrEqual(limit);
    expect(shape(value).depth).toBeLessThanOrEqual(16);
    expect(shape(value).nodes).toBeLessThanOrEqual(20_000);
  }
  const call = dispatchResearchWorkspaceTool("createAgentReport", structuredClone(payload));
  expect(call).toMatchObject({
    method: "POST",
    path: `/projects/${projectId}/agent-reports`,
    projectId,
    idempotencyKey: key,
    body: parsed,
  });
  expect(call?.body).toEqual(parsed);
  expect(call?.body).not.toHaveProperty("project_id");
  expect(call?.body).not.toHaveProperty("idempotency_key");
}

describe("plugin saved-report fixture contracts", () => {
  it("discovers saved-report examples", () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it.each(fixtures)("validates $slug against its report and save route", ({ path, report }) => {
    validateFixture(readFixture(path), report);
  });

  it.each(["site_audit", "ai_visibility", "prompt_explorer", "AI_VISIBILITY"])(
    "rejects reserved fixture kind %s",
    (kind) => {
      const fixture = fixtures[0];
      expect(() => validateFixture({ ...readFixture(fixture.path), kind }, fixture.report)).toThrow(
        "This report kind is reserved",
      );
    },
  );

  it("rejects a fixture kind that disagrees with its report.md", () => {
    const fixture = fixtures[0];
    expect(() =>
      validateFixture(
        { ...readFixture(fixture.path), kind: "different_external_kind" },
        fixture.report,
      ),
    ).toThrow("does not match report.md kind");
  });
});
