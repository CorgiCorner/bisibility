import { describe, expect, it } from "vitest";
import { serpFeaturesExpression } from "./rank-tracker-list-projections";

type SqlFragment = { strings: readonly string[]; values: readonly unknown[] };

function isSqlFragment(value: unknown): value is SqlFragment {
  return Boolean(
    value &&
      typeof value === "object" &&
      "strings" in value &&
      "values" in value &&
      Array.isArray((value as SqlFragment).strings),
  );
}

function sql(value: SqlFragment): string {
  return value.strings.reduce((result, string, index) => {
    const child = value.values[index];
    return `${result}${string}${isSqlFragment(child) ? sql(child) : ""}`;
  }, "");
}

describe("serpFeaturesExpression", () => {
  it("classifies local results before the generic featured branch", () => {
    const statement = sql(serpFeaturesExpression as unknown as SqlFragment);

    expect(statement).toContain("local_pack|local_results|places");
    expect(statement).toContain("'local'");
    expect(statement.indexOf("local_pack|local_results|places")).toBeLessThan(
      statement.indexOf("featured|answer_box"),
    );
  });
});
