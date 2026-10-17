import { describe, expect, it } from "vitest";
import { matchBusinessCollection } from "./match";
import { item, observationRunId, projectId, revision } from "./test-fixtures";

const listing = (id: string, group: number, promotion: "organic" | "promoted" | "unknown") => ({
  ...item(id, group),
  surface: "local_finder" as const,
  resultKind: "listing" as const,
  promotion,
  originalOrdinals: {
    page: null,
    block: null,
    slot: null,
    absolute: group,
    group,
    scale: "finder_group" as const,
  },
});
describe("conservative Finder promotion ambiguity", () => {
  it.each([false, true])(
    "unknown promotion remains potentially organic; reversed=%s",
    (reverse) => {
      const values = [listing("unknown", 1, "unknown"), listing("organic", 2, "organic")];
      const matches = matchBusinessCollection({
        projectId,
        observationRunId,
        targets: [revision()],
        items: reverse ? values.reverse() : values,
      });
      expect(
        matches.every(
          (value) =>
            value.status === "unresolved" &&
            value.reason === "ambiguous_exact_items" &&
            !value.organicEligible,
        ),
      ).toBe(true);
    },
  );
  it("a paid appearance does not resolve an unknown and organic duplicate", () => {
    const matches = matchBusinessCollection({
      projectId,
      observationRunId,
      targets: [revision()],
      items: [
        listing("paid", 1, "promoted"),
        listing("unknown", 2, "unknown"),
        listing("organic", 3, "organic"),
      ],
    });
    expect(matches[0]).toMatchObject({ status: "confirmed", organicEligible: false });
    expect(
      matches
        .slice(1)
        .every((value) => value.reason === "ambiguous_exact_items" && !value.organicEligible),
    ).toBe(true);
  });
});
