import { modelCatalogSnapshotSchema } from "@/lib/model-playground/schema";
import { describe, expect, it } from "vitest";
import { CAPABILITY_VERSION, MODEL_ID } from "./capabilities";
import { normalizeOpenRouterCatalog } from "./catalog";
import { catalog, context, forbidNetwork } from "./test-support";

forbidNetwork();
const normalize = (body: unknown) =>
  normalizeOpenRouterCatalog(body, context().accountDigest, new Date());
describe("explicit catalog intersection", () => {
  it("intersects exact metadata with one curated text/Exa fixture candidate", () => {
    const result = modelCatalogSnapshotSchema.parse(normalize(catalog()));
    expect(result.models).toHaveLength(1);
    expect(result.models[0]).toMatchObject({
      modelId: MODEL_ID,
      capabilityVersion: CAPABILITY_VERSION,
      availability: "fixture_verified",
      maxOutputTokens: 4096,
      temperature: true,
      search: [{ mode: "openrouter_web_exa", countryHint: false, maxCalls: null }],
    });
    expect(result.models[0].text.fixtureRevision).toContain("synthetic");
  });

  it.each(["no text", "no tokens", "duplicate", "alias", "missing limit"])(
    "excludes %s",
    (variant) => {
      const body = catalog();
      const row = body.data[0];
      if (variant === "no text") row.architecture.output_modalities = ["image"];
      if (variant === "no tokens") row.supported_parameters = ["temperature"];
      if (variant === "duplicate") body.data.push(row);
      if (variant === "alias") row.id += ":online";
      if (variant === "missing limit") Object.assign(row, { top_provider: null });
      expect(normalize(body).models).toEqual([]);
    },
  );

  it("uses the smaller limit and disables metadata-unsupported temperature", () => {
    const body = catalog();
    body.data[0].top_provider.max_completion_tokens = 128;
    body.data[0].supported_parameters = ["max_tokens"];
    expect(normalize(body).models[0]).toMatchObject({ maxOutputTokens: 128, temperature: false });
  });

  it("normalizes catalog capabilities without reading pricing", () => {
    const body = catalog();
    expect(Reflect.deleteProperty(body.data[0], "pricing")).toBe(true);
    Object.defineProperty(body.data[0], "pricing", {
      enumerable: true,
      get() {
        throw new Error("Catalog capabilities must not read pricing");
      },
    });
    expect(() => ({ ...body.data[0] })).toThrow("Catalog capabilities must not read pricing");
    expect(() => Object.entries(body.data[0])).toThrow(
      "Catalog capabilities must not read pricing",
    );
    expect(normalize(body).models).toEqual(normalize(catalog()).models);
  });

  it.each([null, [], {}, { data: null }, { data: Array(10_001).fill({}) }])(
    "rejects malformed/oversized catalogs",
    (body) => {
      expect(() => normalize(body)).toThrow("invalid response");
    },
  );
});
