import { expect, it } from "vitest";
import { keywordIdsWhere } from "./ids-where";

const publicId = `kw_${"a".repeat(24)}`;

it("retains the project scope when selecting keyword public IDs", () => {
  expect(keywordIdsWhere("project", [publicId])).toEqual({
    projectId: "project",
    publicId: { in: [publicId] },
  });
  expect(keywordIdsWhere("project", []).publicId.in).toEqual([]);
});

it.each(["internal_keyword", `prj_${"a".repeat(24)}`, "kw_invalid"])(
  "rejects a mixed selection containing a non-keyword public ID: %s",
  (invalid) => {
    expect(() => keywordIdsWhere("project", [publicId, invalid])).toThrow("Keyword not found.");
  },
);
