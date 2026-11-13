import type { AnswerHighlightEntity } from "@/lib/ai-tracking/answer-highlight";
import { describe, expect, it } from "vitest";
import { researchPresence, researchPresenceCounts } from "./research-presence";

const project: AnswerHighlightEntity = {
  id: "prj_example",
  kind: "project",
  label: "Example",
  names: {
    aliases: ["Ex"],
    domain: "example.com",
    excludedNames: ["Example County"],
    label: "Example",
  },
};
const north: AnswerHighlightEntity = {
  id: "cmp_north",
  kind: "competitor",
  label: "North",
  names: { domain: "north.example.org", label: "North" },
};

describe("researchPresence", () => {
  it("classifies missing, shared and only you from the current names", () => {
    expect(researchPresence(["North leads this list"], [project, north])).toMatchObject({
      presence: "missing",
      youNamed: false,
    });
    expect(researchPresence(["Example and North both appear"], [project, north])).toMatchObject({
      brands: [
        { kind: "project", label: "Example" },
        { kind: "competitor", label: "North" },
      ],
      presence: "shared",
      youNamed: true,
    });
    expect(researchPresence(["Example publishes the list"], [project, north]).presence).toBe(
      "only_you",
    );
    expect(researchPresence(["A general buying guide"], [project, north]).presence).toBe(
      "unmentioned",
    );
  });

  it("follows the current alias and exclusion instead of a stored mention flag", () => {
    expect(researchPresence(["Ask Ex first"], [project, north]).youNamed).toBe(true);
    expect(researchPresence(["Example County is unrelated"], [project, north])).toMatchObject({
      presence: "unmentioned",
      youNamed: false,
    });
    expect(
      researchPresence(["Nobody here"], [{ ...project, names: { label: "Renamed" } }]).youNamed,
    ).toBe(false);
  });

  it("counts the four filters from classified rows", () => {
    expect(
      researchPresenceCounts([
        { presence: "missing" },
        { presence: "shared" },
        { presence: "only_you" },
        { presence: "unmentioned" },
      ]),
    ).toEqual({ all: 4, missing: 1, onlyYou: 1, shared: 1 });
  });
});
