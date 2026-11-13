import { describe, expect, it } from "vitest";
import { agentReportSchema, externalAgentReportSchema } from "./model";

const valid = {
  kind: "prompt_explorer",
  title: "Comparison",
  body: { result: { response: "Brand mentioned", costCents: 0 } },
};

describe("agent report boundaries", () => {
  it("preserves producer JSON keys and defaults provenance", () => {
    expect(agentReportSchema.parse(valid)).toEqual({ ...valid, provenance: {} });
  });
  it("rejects huge, deeply nested, cyclic and non-JSON content", () => {
    expect(
      agentReportSchema.safeParse({ ...valid, body: { text: "é".repeat(140000) } }).success,
    ).toBe(false);
    let nested: object = {};
    for (let index = 0; index < 18; index++) nested = { nested };
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    for (const body of [
      nested,
      cyclic,
      { value: Number.NaN },
      { value: undefined },
      { value: new Date() },
    ]) {
      expect(agentReportSchema.safeParse({ ...valid, body }).success).toBe(false);
    }
  });
  it("rejects empty titles, unbounded provenance, arrays and extra transport fields", () => {
    for (const input of [
      { ...valid, title: " " },
      { ...valid, body: [] },
      { ...valid, provenance: { text: "x".repeat(33000) } },
      { ...valid, projectId: "other" },
    ]) {
      expect(agentReportSchema.safeParse(input).success).toBe(false);
    }
  });
});

it("reserves keyword research evidence for trusted application producers", () => {
  expect(externalAgentReportSchema.safeParse({ ...valid, kind: "prompt_research" }).success).toBe(
    false,
  );
  expect(externalAgentReportSchema.safeParse({ ...valid, kind: "challenge_report" }).success).toBe(
    false,
  );
  expect(agentReportSchema.safeParse({ ...valid, kind: "prompt_research" }).success).toBe(true);
  expect(agentReportSchema.safeParse({ ...valid, kind: "challenge_report" }).success).toBe(true);
});
