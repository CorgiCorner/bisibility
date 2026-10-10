import { describe, expect, it } from "vitest";
import {
  type AiModelRate,
  catalogAdmissionBound,
  parseResponsesBasePrice,
  parseVisibilityPrice,
} from "./catalog-pricing";

function accountFixture(costs: unknown = [{ cost_type: "per_request", cost: 0.0006 }]) {
  // Synthetic minimal payload using the authenticated free account's verified hierarchy.
  return {
    status_code: 20000,
    cost: 0,
    tasks_error: 0,
    tasks: [
      {
        status_code: 20000,
        cost: 0,
        result: [
          {
            price: {
              ai_optimization: {
                llm_responses: {
                  live: { priority_normal: costs },
                },
              },
            },
          },
        ],
      },
    ],
  };
}

const capability = { reasoning: false, web_search_supported: true };
const input = { max_output_tokens: 4096, web_search: false };
const rate: AiModelRate = {
  inputUsdPerMillion: 0.4,
  outputUsdPerMillion: 1.6,
  contextTokens: 1_047_576,
  maxOutputTokens: 32_768,
  checkedAt: "2026-10-06T09:00:00Z",
  sourceUrl: "https://example.com/official-model-pricing",
};

describe("official account base task pricing", () => {
  it("converts the exact documented base rate to cents", () => {
    expect(parseResponsesBasePrice(accountFixture())).toBe(0.06);
  });
  it.each(
    [
      undefined,
      [],
      [{ cost_type: "per_request", cost: 0 }],
      [{ cost_type: "per_request", cost: -0.1 }],
      [{ cost_type: "per_request", cost: Number.POSITIVE_INFINITY }],
      [{ cost_type: "per_request", cost: Number.MAX_VALUE }],
      [{ cost_type: "per_request", cost: "0.0006" }],
      [{ cost_type: "per_request", cost: 0.0006, additional_request_fee: 50 }],
      [{ cost_type: "per_request", cost: 0.0006, currency: "EUR" }],
      [{ cost_type: "per_result", cost: 0.0006 }],
      [
        { cost_type: "per_request", cost: 0.0006 },
        { cost_type: "per_token", cost: 0.1 },
      ],
    ].map((costs) => ({ costs })),
  )("rejects missing or unrecognized charge rows %#", ({ costs }) => {
    const payload = accountFixture();
    payload.tasks[0].result[0].price.ai_optimization.llm_responses.live.priority_normal = costs;
    expect(parseResponsesBasePrice(payload)).toBeNull();
  });
  it("rejects API or task errors and a charged catalog response", () => {
    expect(parseResponsesBasePrice({ ...accountFixture(), status_code: 50000 })).toBeNull();
    expect(parseResponsesBasePrice({ ...accountFixture(), tasks_error: 1 })).toBeNull();
    expect(parseResponsesBasePrice({ ...accountFixture(), cost: 0.01 })).toBeNull();
    const payload = accountFixture();
    payload.tasks[0].status_code = 50000;
    expect(parseResponsesBasePrice(payload)).toBeNull();
  });
  it("rejects the previously inferred platform nesting and missing branches", () => {
    const payload = accountFixture();
    const ai = payload.tasks[0].result[0].price.ai_optimization;
    expect(
      parseResponsesBasePrice({
        ...payload,
        tasks: [
          { ...payload.tasks[0], result: [{ price: { ai_optimization: { chat_gpt: ai } } }] },
        ],
      }),
    ).toBeNull();
    expect(parseResponsesBasePrice({ ...accountFixture(), tasks: [] })).toBeNull();
  });
});

describe("official account visibility pricing", () => {
  function visibilityFixture(rows: unknown) {
    // Fictional account-shaped hierarchy, not an authenticated account capture.
    return {
      ...accountFixture(),
      tasks: [
        {
          status_code: 20000,
          cost: 0,
          result: [
            {
              price: {
                ai_optimization: {
                  llm_mentions: {
                    search_mentions: {
                      live: { priority_normal: rows },
                    },
                  },
                },
              },
            },
          ],
        },
      ],
    };
  }
  const rows = [
    { cost_type: "per_request", cost: 0.1 },
    { cost_type: "per_result", cost: 0.001 },
  ];
  it("rejects an unknown charge attached to a recognized visibility row", () => {
    expect(
      parseVisibilityPrice(
        visibilityFixture([{ ...rows[0], additional_request_fee: 50 }, rows[1]]),
      ),
    ).toBeNull();
  });
  it("requires both independently charged request and result rates", () => {
    expect(parseVisibilityPrice(visibilityFixture(rows))).toEqual({
      requestCostCents: 10,
      rowCostCents: 0.1,
    });
    expect(parseVisibilityPrice(visibilityFixture([...rows].reverse()))).toEqual({
      requestCostCents: 10,
      rowCostCents: 0.1,
    });
  });
  it.each(
    [
      undefined,
      [],
      [rows[0]],
      [rows[1]],
      [rows[0], rows[0]],
      [rows[1], rows[1]],
      [{ ...rows[0], cost: 0 }, rows[1]],
      [rows[0], { ...rows[1], cost: 0 }],
      [rows[0], { ...rows[1], cost_type: "per_token" }],
      [rows[0], { ...rows[1], cost: Number.MAX_VALUE }],
      [rows[0], { ...rows[1], cost: "0.001" }],
      [...rows, { cost_type: "per_request", cost: 0.0001 }],
    ].map((value) => ({ value })),
  )("blocks absent, duplicate or unknown charge components %#", ({ value }) => {
    expect(parseVisibilityPrice(visibilityFixture(value))).toBeNull();
  });
  it("does not substitute prompt prices or failed metadata for visibility rates", () => {
    expect(parseVisibilityPrice(accountFixture())).toBeNull();
    expect(parseVisibilityPrice({ ...visibilityFixture(rows), status_code: 50000 })).toBeNull();
  });
});

describe("catalog model admission", () => {
  it("charges the full input context bound and rounds upwards", () => {
    expect(catalogAdmissionBound(capability, input, 0.06, rate)).toBe(42.6184);
  });
  it("uses the hard output bound when reasoning can exceed requested tokens", () => {
    expect(catalogAdmissionBound({ ...capability, reasoning: true }, input, 0.06, rate)).toBe(
      47.206,
    );
  });
  it("refuses web search without a verified total search fee cap", () => {
    expect(
      catalogAdmissionBound(capability, { ...input, web_search: true }, 0.06, rate),
    ).toBeNull();
  });
  it("adds the search cap and hard output bound when all costs are known", () => {
    expect(
      catalogAdmissionBound(capability, { ...input, web_search: true }, 0.06, {
        ...rate,
        webSearchMaxCostCents: 2,
      }),
    ).toBe(49.206);
  });
  it("refuses unsupported web search even when a cap exists", () => {
    expect(
      catalogAdmissionBound(
        { ...capability, web_search_supported: false },
        {
          ...input,
          web_search: true,
        },
        0.06,
        { ...rate, webSearchMaxCostCents: 2 },
      ),
    ).toBeNull();
  });
  it.each([null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses unknown or invalid base rate %s",
    (base) => {
      expect(catalogAdmissionBound(capability, input, base, rate)).toBeNull();
    },
  );
  it.each([
    null,
    { ...rate, inputUsdPerMillion: 0 },
    { ...rate, outputUsdPerMillion: -1 },
    { ...rate, contextTokens: 0 },
    { ...rate, maxOutputTokens: undefined },
    { ...rate, sourceUrl: "http://example.com/pricing" },
    { ...rate, sourceUrl: "invalid-url" },
    { ...rate, checkedAt: "unknown" },
  ])("refuses incomplete model rates %#", (candidate) => {
    expect(
      catalogAdmissionBound(capability, input, 0.06, candidate as AiModelRate | null),
    ).toBeNull();
  });
  it("enforces endpoint and reasoning token bounds before execution", () => {
    expect(
      catalogAdmissionBound(capability, { ...input, max_output_tokens: 4097 }, 0.06, rate),
    ).toBeNull();
    expect(
      catalogAdmissionBound(capability, { ...input, max_output_tokens: 15 }, 0.06, rate),
    ).toBeNull();
    expect(
      catalogAdmissionBound(
        { ...capability, reasoning: true },
        {
          ...input,
          max_output_tokens: 512,
        },
        0.06,
        rate,
      ),
    ).toBeNull();
    expect(
      catalogAdmissionBound(capability, input, 0.06, { ...rate, maxOutputTokens: 1024 }),
    ).toBeNull();
  });
});
