import { samplePlan } from "@/lib/ai-tracking/execution/fixture";
import { normalizeTrackingResponse } from "@/lib/ai-tracking/providers/normalize";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { trackingRawEvidenceSchema, trackingSampleSchema } from "./openapi-tracking-evidence";
import { aiTrackingComponentSchemas, aiTrackingResponseSchemas } from "./openapi-tracking-schemas";

const validate = new Ajv2020({ strict: false, allowUnionTypes: true }).compile(
  trackingRawEvidenceSchema,
);

describe("AI tracking raw evidence contract", () => {
  it("shares one named raw component between samples and exports", () => {
    const reference = { $ref: "#/components/schemas/AiTrackingRawEvidence" };
    expect(trackingSampleSchema).toMatchObject({
      properties: { evidence: { oneOf: [{ properties: { raw: reference } }, { type: "null" }] } },
    });
    expect(aiTrackingComponentSchemas.AiTrackingRawEvidence).toBe(trackingRawEvidenceSchema);
    expect(aiTrackingResponseSchemas.exportAiTrackingEvidence).toMatchObject({
      properties: { data: { properties: { items: { items: trackingSampleSchema } } } },
    });
  });

  it("accepts arbitrary provider fields and both bounding representations", () => {
    for (const raw of [
      null,
      { status_code: 20000, result: [{ ProviderCase: [true, null, { nestedKey: 1 }] }] },
      { truncated: true, preview: '{"result":[' },
      '{"status_code":20000,"result":[',
    ]) {
      expect(validate(raw), JSON.stringify(validate.errors)).toBe(true);
    }
  });

  it.each([true, 20000, [], [{ type: "message" }]].map((raw) => ({ raw })))(
    "rejects non-projection raw $raw",
    ({ raw }) => {
      expect(validate(raw)).toBe(false);
    },
  );

  it("accepts the actual provider bound's string output", () => {
    const result = normalizeTrackingResponse(
      samplePlan(),
      {
        status_code: 20000,
        tasks: [{ status_code: 20000, result: [{ items: [{ text: "x".repeat(600000) }] }] }],
      },
      "2026-10-18T00:00:00.000Z",
    );
    expect(result.evidence.rawTruncated).toBe(true);
    expect(typeof result.evidence.raw).toBe("string");
    expect(validate(result.evidence.raw)).toBe(true);
  });
});
