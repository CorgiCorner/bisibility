import { describe, expect, it } from "vitest";
import { matchBrandNamesInAnswer } from "./brand-name-match";
import { trackingEntityObservations } from "./execution/observations";

const names = {
  aliases: ["Acme Tools"],
  domain: "acme.example.com",
  excludedNames: ["acme.example.org"],
  label: "Acme",
};

describe("matchBrandNamesInAnswer", () => {
  it("suppresses only the name match inside an excluded span", () => {
    const covered = matchBrandNamesInAnswer("See acme.example.org today.", names);
    expect(covered.named).toBe(false);

    const both = matchBrandNamesInAnswer(
      "acme.example.org is unrelated. Acme is the product.",
      names,
    );
    expect(both.named).toBe(true);
    expect(both.matches.map((match) => match.name)).toContain("Acme");
    expect(both.position).toBeGreaterThan("acme.example.org".length);
  });

  it("matches case-insensitively and keeps Unicode word boundaries", () => {
    expect(matchBrandNamesInAnswer("ACME ships", names).named).toBe(true);
    expect(matchBrandNamesInAnswer("Visit Ａｃｍｅ today", names).named).toBe(true);
    expect(matchBrandNamesInAnswer("Acmeology is different", names).named).toBe(false);
    expect(matchBrandNamesInAnswer("myacme catalog", names).named).toBe(false);
    expect(matchBrandNamesInAnswer("The Acme catalog", names).position).toBe(4);
  });

  it("reads old snapshots that omit excluded names", () => {
    const result = trackingEntityObservations("Acme is here.", [
      { aliases: [], id: "p", kind: "project", label: "Acme" },
    ]);
    expect(result[0]).toMatchObject({
      competitorId: null,
      matchPolicy: "nfkc_unicode_word_v1",
      mentioned: true,
    });
  });
});
