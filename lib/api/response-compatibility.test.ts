import { readFileSync, writeFileSync } from "node:fs";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import { expect, it, vi } from "vitest";
import { getBacklinks } from "./backlinks";
import {
  failedSummaryApiContext,
  failedSummaryFixture,
  failedSummaryProjectId,
} from "./backlinks-failed-summary.test-fixture";
import { backlinksSchemas } from "./openapi-backlinks";
import {
  type KeywordRecord,
  keywordResource,
  type RankCheckRecord,
  rankCheckResource,
} from "./resources";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
const mocks = vi.hoisted(() => ({ analyze: vi.fn() }));
vi.mock("@/lib/backlinks/service", () => ({ analyzeBacklinks: mocks.analyze }));

const date = new Date("2026-10-08T12:00:00.000Z");
const completed = {
  checkedAt: date,
  error: null,
  errorCode: null,
  position: 6,
  previousPosition: 8,
  publicId: "check_a00000000000000000000000",
  rankingUrl: "https://example.com/rank",
  run: null,
  status: "completed",
};

function keyword(check: typeof completed) {
  return {
    createdAt: date,
    device: "desktop",
    id: "fixture_keyword",
    intent: null,
    location: "United States",
    locationRef: { canonicalKey: "US", languageCode: "en", languageLabel: "English" },
    project: { defaults: null },
    publicId: "kw_a00000000000000000000000",
    rankChecks: [check],
    schedule: null,
    tags: [],
    targetUrl: null,
    text: "example keyword",
    topic: null,
    updatedAt: date,
  } as unknown as KeywordRecord;
}

it("generates the same response evidence consumed by all SDKs and MCP", async () => {
  const full = {
    ok: true,
    cached: false,
    cachedUntil: "2026-10-09T12:00:00.000Z",
    costCents: 0.3,
    fetchedAt: date.toISOString(),
    fetchedRowCount: 0,
    history: Array.from({ length: 12 }, (_, month) => ({
      month: `2026-${String(month + 1).padStart(2, "0")}`,
      newLinks: month + 1,
      lostLinks: 2,
      newReferringDomains: 1,
      lostReferringDomains: 1,
    })),
    includeSubdomains: true,
    provider: "dataforseo",
    rows: [],
    summary: failedSummaryFixture.summary,
    target: "example.com",
    targetScope: "site",
    totalRowsAvailable: 12,
  };
  const responses = [];
  for (const outcome of [
    full,
    { ...full, history: [], historyUnavailable: true },
    failedSummaryFixture,
    { ...full, targetScope: "page", target: "https://example.com/page", history: [] },
  ]) {
    mocks.analyze.mockResolvedValueOnce(outcome);
    const response = await getBacklinks(failedSummaryApiContext(), failedSummaryProjectId);
    responses.push({ status: response.status, body: await response.json() });
  }
  const ranks = ["complete", "unknown", "truncated_by_stop_on_match", null].flatMap(
    (completeness) =>
      [null, 6].map((position) => {
        const check = {
          ...completed,
          position,
          attempts: null,
          billingUnits: null,
          costCents: null,
          keyword: { publicId: "kw_a00000000000000000000000" },
          observationRun: completeness === null ? null : { completeness },
          provider: "dataforseo",
        };
        return {
          check: rankCheckResource(check as unknown as RankCheckRecord),
          keyword: keywordResource(keyword(check as typeof completed), failedSummaryProjectId, {
            ...check,
            keywordId: "fixture_keyword",
          }),
        };
      }),
  );
  const failure = {
    ...completed,
    error: "Provider request failed.",
    errorCode: "provider_error",
    position: null,
    rankingUrl: null,
    status: "failed",
  };
  const fixture = {
    generated_by: "lib/api/response-compatibility.test.ts",
    full_backlinks: responses[0],
    partial_backlinks: responses[1],
    failed_summary: responses[2],
    page_backlinks: responses[3],
    ranks,
    unobserved_keyword: keywordResource(
      { ...keyword(completed), rankChecks: [] },
      failedSummaryProjectId,
    ),
    failed_keyword: keywordResource(
      keyword(failure as unknown as typeof completed),
      failedSummaryProjectId,
      {
        ...completed,
        keywordId: "fixture_keyword",
        observationRun: { completeness: "truncated_by_stop_on_match" },
      },
    ),
  };
  const output = process.env.API_RESPONSE_FIXTURES_OUTPUT;
  if (output) writeFileSync(output, `${JSON.stringify(fixture, null, 2)}\n`);
  else {
    const stored = JSON.parse(
      readFileSync("lib/api/__fixtures__/response-compatibility.json", "utf8"),
    );
    expect(fixture).toEqual(stored);
  }
  expect(responses.map((response) => response.status)).toEqual([200, 200, 500, 200]);
  expect(responses[2].body.details.cost_cents).toBeNull();
  expect(responses[2].body).not.toHaveProperty("data");
  const validate = new AjvJsonSchemaValidator().getValidator(
    backlinksSchemas.BacklinksSnapshot as never,
  );
  for (const response of responses.slice(0, 2))
    expect(validate(response.body.data).valid).toBe(true);
  expect(validate(responses[3].body.data).valid).toBe(true);
  const normal = responses[0].body.data;
  for (const history of [[], normal.history.slice(1), [...normal.history, normal.history[0]]])
    expect(validate({ ...normal, history }).valid).toBe(false);
  expect(validate({ ...normal, history: [], history_unavailable: false }).valid).toBe(false);
  expect(validate({ ...normal, history_unavailable: true }).valid).toBe(false);
});
