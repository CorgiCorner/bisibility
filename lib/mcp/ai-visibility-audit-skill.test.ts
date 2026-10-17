import { externalAgentReportSchema } from "@/lib/agent-reports/model";
import fixture from "@/plugins/bisibility/skills/ai-visibility-audit/references/example-report.json";
import { describe, expect, it } from "vitest";
import { dispatchResearchWorkspaceTool } from "./research-workspace-tools";

function shape(value: unknown): { depth: number; nodes: number } {
  if (!value || typeof value !== "object") return { depth: 0, nodes: 1 };
  const children = Object.values(value).map(shape);
  return {
    depth: children.length ? 1 + Math.max(...children.map((child) => child.depth)) : 0,
    nodes: 1 + children.reduce((total, child) => total + child.nodes, 0),
  };
}

const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");

describe("installable AI visibility audit skill contract", () => {
  it("accepts its documented external payload and preserves its save route and key", () => {
    const call = dispatchResearchWorkspaceTool("createAgentReport", structuredClone(fixture));
    expect(externalAgentReportSchema.parse(call?.body)).toEqual({
      kind: fixture.kind,
      title: fixture.title,
      body: fixture.body,
      provenance: fixture.provenance,
    });
    expect(fixture.kind).toBe("ai_visibility_audit");
    expect(call).toMatchObject({
      method: "POST",
      path: `/projects/${fixture.project_id}/agent-reports`,
      projectId: fixture.project_id,
      idempotencyKey: fixture.idempotency_key,
    });
    expect(call?.body).not.toHaveProperty("project_id");
    expect(call?.body).not.toHaveProperty("idempotency_key");
  });

  it("uses an external kind rather than a reserved producer kind", () => {
    const result = externalAgentReportSchema.shape.kind.safeParse(fixture.kind);
    expect(result.error?.issues.map((issue) => issue.message) ?? []).toEqual([]);
    expect(result.success).toBe(true);
    for (const kind of ["site_audit", "ai_visibility", "prompt_explorer", "AI_VISIBILITY"]) {
      const reserved = externalAgentReportSchema.shape.kind.safeParse(kind);
      expect(reserved.error?.issues[0].message).toContain("reserved");
    }
  });

  it("fits the documented UTF-8 size, depth and node limits", () => {
    expect(bytes(fixture)).toBeLessThan(64 * 1024);
    expect(bytes(fixture)).toBeLessThan(320 * 1024);
    for (const [value, limit] of [
      [fixture.body, 256 * 1024],
      [fixture.provenance, 32 * 1024],
    ] as const) {
      expect(bytes(value)).toBeLessThanOrEqual(limit);
      expect(shape(value).depth).toBeLessThanOrEqual(16);
      expect(shape(value).nodes).toBeLessThanOrEqual(20_000);
    }
  });

  it("grounds three recommendations and keeps observed and synthetic denominators separate", () => {
    const evidenceIds = fixture.body.evidence.map((entry) => entry.id);
    expect(fixture.body.recommendations).toHaveLength(3);
    for (const recommendation of fixture.body.recommendations) {
      expect(recommendation.evidence_ids.length).toBeGreaterThan(0);
      expect(evidenceIds).toEqual(expect.arrayContaining(recommendation.evidence_ids));
    }
    expect(fixture.provenance.evidence_ids).toEqual(evidenceIds);
    const sources = fixture.body.coverage.source_classes;
    expect(sources.retained_provider_answers.eligible_mention_denominator).toBe(
      sources.retained_provider_answers.answer_present,
    );
    expect(sources.synthetic_prompt_tests.eligible_test_denominator).toBe(
      sources.synthetic_prompt_tests.answer_present,
    );
    for (const [url] of JSON.stringify(fixture).matchAll(/https?:\/\/[^"\s]+/g)) {
      expect(new URL(url).hostname).toBe("example.com");
      expect(new URL(url).username).toBe("");
      expect(new URL(url).password).toBe("");
    }
  });
});
