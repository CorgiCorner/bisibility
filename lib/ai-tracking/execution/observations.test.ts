import { expect, it } from "vitest";
import { trackingEntityObservations } from "./observations";

it("matches retained aliases literally with Unicode word boundaries and immutable evidence", () => {
  const result = trackingEntityObservations(
    "Acme is here. Consider Beta+ too. Betamax is different.",
    [
      { kind: "project", id: "p", label: "Acme", aliases: [] },
      { kind: "competitor", id: "c", label: "Beta", aliases: ["Beta+"] },
      { kind: "competitor", id: "d", label: "Max", aliases: [] },
    ],
  );
  expect(result[0]).toMatchObject({ competitorId: null, mentioned: true, confidence: 1 });
  expect(result[1]).toMatchObject({
    competitorId: "c",
    mentioned: true,
    matchPolicy: "nfkc_unicode_word_v1",
  });
  expect(result[1].snippet).toContain("Beta+");
  expect(result[2].mentioned).toBe(false);
});

it("keeps NFKC matching, earliest retained aliases and literal punctuation", () => {
  const answer = "Ｂｅｔａ＋ is first; Acme is later; [a+]+$ is a literal name.";
  const result = trackingEntityObservations(answer, [
    { kind: "project", id: "p", label: "Acme", aliases: ["Beta+"] },
    { kind: "competitor", id: "c", label: "[a+]+$", aliases: [] },
    { kind: "competitor", id: "d", label: "a+b", aliases: [] },
  ]);
  expect(result[0]).toMatchObject({ position: 0, mentioned: true, competitorId: null });
  expect(result[1]).toMatchObject({ mentioned: true, competitorId: "c", confidence: 1 });
  expect(result[1].snippet).toContain("[a+]+$");
  expect(result[2]).toMatchObject({ mentioned: false, confidence: null, snippet: null });
});
