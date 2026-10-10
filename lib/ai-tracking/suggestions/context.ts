export interface TrackingSuggestion {
  text: string;
  category: "neutral" | "comparative" | "branded";
  provenance: "generated_hypothesis" | "provider_dataset";
  evidenceIds: string[];
  popularity: number | null;
  accepted: false;
}
export function contextSuggestions(input: {
  brand: string;
  offering: string;
  competitors?: readonly string[];
}): TrackingSuggestion[] {
  const offering = input.offering.trim();
  if (!offering) return [];
  const drafts = [
    { text: `What should I look for when choosing ${offering}?`, category: "neutral" as const },
    {
      text: `What are the strengths and limitations of ${input.brand} for ${offering}?`,
      category: "branded" as const,
    },
    ...(input.competitors?.slice(0, 5).map((competitor) => ({
      text: `How does ${input.brand} compare with ${competitor} for ${offering}?`,
      category: "comparative" as const,
    })) ?? []),
  ];
  return deduplicateSuggestions(
    drafts.map((draft) => ({
      ...draft,
      provenance: "generated_hypothesis",
      evidenceIds: [],
      popularity: null,
      accepted: false,
    })),
  );
}
export function deduplicateSuggestions(drafts: readonly TrackingSuggestion[]) {
  const seen = new Set<string>();
  return drafts.filter((draft) => {
    const key = draft.text.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
