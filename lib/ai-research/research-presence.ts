import type { AnswerHighlightEntity } from "@/lib/ai-tracking/answer-highlight";
import { matchBrandNamesInAnswer } from "@/lib/ai-tracking/brand-name-match";

/** A displayed question's relationship to the project and its competitors. */
export type ResearchPresence = "missing" | "only_you" | "shared" | "unmentioned";

export type ResearchNamedBrand = {
  id: string;
  kind: "competitor" | "project";
  label: string;
};

export type ResearchPresenceMatch = {
  brands: ResearchNamedBrand[];
  presence: ResearchPresence;
  youNamed: boolean;
};

/**
 * Classifies answers with the current brand-name matcher. Stored mention flags are ignored.
 * Missing: a competitor is named and the project is not. Shared: both. Only you: the project
 * alone. Anything else stays unmentioned and is visible only in All.
 */
export function researchPresence(
  answers: readonly string[],
  entities: readonly AnswerHighlightEntity[],
): ResearchPresenceMatch {
  const brands = entities.filter((entity) =>
    answers.some((answer) => matchBrandNamesInAnswer(answer, entity.names).named),
  );
  const youNamed = brands.some((brand) => brand.kind === "project");
  const competitorNamed = brands.some((brand) => brand.kind === "competitor");
  const presence: ResearchPresence =
    youNamed && competitorNamed
      ? "shared"
      : youNamed
        ? "only_you"
        : competitorNamed
          ? "missing"
          : "unmentioned";
  return {
    brands: brands.map((brand) => ({ id: brand.id, kind: brand.kind, label: brand.label })),
    presence,
    youNamed,
  };
}

export function researchPresenceCounts(rows: readonly { presence: ResearchPresence }[]) {
  return {
    all: rows.length,
    missing: rows.filter((row) => row.presence === "missing").length,
    onlyYou: rows.filter((row) => row.presence === "only_you").length,
    shared: rows.filter((row) => row.presence === "shared").length,
  };
}
