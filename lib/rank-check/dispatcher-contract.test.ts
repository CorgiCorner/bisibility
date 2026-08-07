import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const baseline = readFileSync(
  "prisma/migrations/20260806000000_squashed_migrations/migration.sql",
  "utf8",
);
const schema = readFileSync("prisma/schema.prisma", "utf8");
const dispatcherSources = [
  "lib/rank-check/dispatcher.ts",
  "lib/rank-check/dispatcher-compensation.ts",
  "lib/rank-check/dispatcher-query.ts",
  "lib/rank-check/dispatcher-state.ts",
  "lib/temporal/rank-check-dispatcher-activities.ts",
  "lib/temporal/rank-check-dispatcher-workflows.ts",
]
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

describe("dispatcher persistence contract", () => {
  it("stores only keywordId and indexed nextCheckAt with cascade delete", () => {
    const table = baseline.slice(
      baseline.indexOf('CREATE TABLE "keyword_dispatch_states"'),
      baseline.indexOf(";", baseline.indexOf('CREATE TABLE "keyword_dispatch_states"')),
    );
    const columns = [...table.matchAll(/^\s*"([^"]+)"\s+[A-Z]/gm)].map((match) => match[1]);
    expect(columns).toEqual(["keywordId", "nextCheckAt"]);
    expect(baseline).toContain('"keyword_dispatch_states_nextCheckAt_keywordId_idx"');
    expect(baseline).toContain(
      'FOREIGN KEY ("keywordId") REFERENCES "keywords"("id") ON DELETE CASCADE',
    );
    expect(table).not.toMatch(/frequency|cronExpression|timezone|jitterMinutes/);
  });

  it("ships only the deterministic composite due index", () => {
    expect(baseline).toContain(
      'CREATE INDEX "keyword_dispatch_states_nextCheckAt_keywordId_idx" ON "keyword_dispatch_states"("nextCheckAt" ASC, "keywordId" ASC);',
    );
    expect(baseline).not.toContain('"keyword_dispatch_states_nextCheckAt_idx"');
    const model = schema.slice(
      schema.indexOf("model KeywordDispatchState"),
      schema.indexOf("model RankCheck"),
    );
    expect(model).toContain("@@index([nextCheckAt, keywordId])");
    expect(model).not.toContain("@@index([nextCheckAt])");
  });

  it("ranks before limiting and locks only bounded fair candidates", () => {
    const query = readFileSync("lib/rank-check/dispatcher-query.ts", "utf8");
    const fairQuery = query.slice(query.indexOf("export function fairDueStatesSql"));
    expect(fairQuery).toContain("ROW_NUMBER() OVER");
    const rankedCandidates = fairQuery.slice(fairQuery.indexOf('WHERE "projectRank" <='));
    expect(rankedCandidates.indexOf('WHERE "projectRank" <=')).toBeLessThan(
      rankedCandidates.indexOf("LIMIT"),
    );
    expect(fairQuery).toContain("FOR UPDATE OF state SKIP LOCKED");
    expect(fairQuery).not.toMatch(/for\s*\([^)]*project/i);
    expect(query).toContain("SET LOCAL work_mem = '64MB'");
  });

  it("never writes legacy schedule nextCheckAt fields from dispatcher code", () => {
    expect(dispatcherSources).not.toMatch(
      /(?:UPDATE|update|data:)[\s\S]{0,80}(?:keyword_schedules|project_defaults)[\s\S]{0,80}nextCheckAt/,
    );
  });

  it("routes UI, REST, bulk, import, and settings mutations through state maintenance", () => {
    const creationPaths = [
      "lib/actions/keyword.ts",
      "lib/actions/keyword-import-export.ts",
      "lib/actions/keyword-matrix.ts",
      "lib/api/keyword-create.ts",
    ];
    const schedulePaths = [
      "lib/actions/keyword-bulk.ts",
      "lib/actions/keyword-schedule.ts",
      "lib/api/keyword-bulk.ts",
      "lib/api/keywords.ts",
    ];
    const defaultsPaths = [
      "lib/actions/project.ts",
      "lib/actions/settings.ts",
      "lib/api/project-defaults.ts",
    ];

    expect(readFileSync("lib/actions/keyword-batch.ts", "utf8")).toContain(
      "seedKeywordDispatchStates",
    );
    expect(readFileSync("lib/sample-data/install.ts", "utf8")).toContain(
      "seedKeywordDispatchStates",
    );
    for (const path of creationPaths) {
      expect(readFileSync(path, "utf8"), path).toMatch(/createKeywordBatch(?:Set)?/);
    }
    for (const path of [...schedulePaths, ...defaultsPaths]) {
      expect(readFileSync(path, "utf8"), path).toContain("refreshKeywordDispatchStates");
    }
  });
});
