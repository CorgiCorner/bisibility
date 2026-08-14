import { describe, expect, it } from "vitest";
import { ApiInputError } from "./errors";
import {
  requireApiAlertRulePublicIds,
  requireApiPathPublicIds,
  requireApiPublicId,
} from "./public-id";

function expectInvalidPublicId(callback: () => unknown) {
  expect(callback).toThrow(ApiInputError);
  try {
    callback();
  } catch (error) {
    expect((error as ApiInputError).code).toBe("invalid_public_id");
  }
}

describe("public API ID boundary", () => {
  it("accepts only the requested v3 public prefix", () => {
    expect(requireApiPublicId("prj_a00000000000000000000000", "prj")).toBe(
      "prj_a00000000000000000000000",
    );
  });

  it("rejects raw and wrong-prefix path IDs with invalid_public_id", () => {
    expectInvalidPublicId(() => requireApiPathPublicIds(["projects", "project_db_1", "keywords"]));
    expectInvalidPublicId(() => requireApiPublicId("kw_a00000000000000000000000", "prj"));
  });

  it("rejects raw alert-rule target and recipient IDs", () => {
    expectInvalidPublicId(() =>
      requireApiAlertRulePublicIds({
        marketIds: [],
        recipientIds: ["user_db_1"],
        targetIds: ["kw_a00000000000000000000000"],
        targetType: "keyword",
      }),
    );
    expectInvalidPublicId(() =>
      requireApiAlertRulePublicIds({
        marketIds: [],
        targetIds: ["kw_a00000000000000000000000"],
        targetType: "tag",
      }),
    );
    expectInvalidPublicId(() =>
      requireApiAlertRulePublicIds({
        marketIds: ["project_market_db_1"],
        targetIds: [],
        targetType: "all",
      }),
    );
  });
});
