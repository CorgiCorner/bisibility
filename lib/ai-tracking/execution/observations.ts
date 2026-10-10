import type { EntityObservationInput, JsonValue } from "@/lib/ai-tracking/contract";
import { findLiteralWordMatch } from "@/lib/ai-tracking/literal-match";

export function trackingEntityObservations(
  answer: string | null,
  snapshot: JsonValue,
): EntityObservationInput[] {
  if (!answer || !Array.isArray(snapshot)) return [];
  const normalized = answer.normalize("NFKC").toLocaleLowerCase("en");
  return snapshot.flatMap((entity) => {
    if (
      !entity ||
      typeof entity !== "object" ||
      Array.isArray(entity) ||
      typeof entity.id !== "string"
    )
      return [];
    const name =
      typeof entity.label === "string"
        ? entity.label
        : typeof entity.domain === "string"
          ? entity.domain
          : "";
    const aliases = [
      ...new Set(
        [name, entity.domain, ...(Array.isArray(entity.aliases) ? entity.aliases : [])].filter(
          (value): value is string => typeof value === "string" && value.trim().length > 0,
        ),
      ),
    ];
    let position: number | null = null;
    for (const alias of aliases) {
      const match = findLiteralWordMatch(
        normalized,
        alias.normalize("NFKC").toLocaleLowerCase("en"),
      );
      if (match && (position === null || match.index < position)) position = match.index;
    }
    return [
      {
        entityKey: entity.id,
        competitorId: entity.kind === "project" ? null : entity.id,
        name,
        aliases,
        mentioned: position !== null,
        position,
        snippet:
          position === null ? null : answer.slice(Math.max(0, position - 100), position + 200),
        matchPolicy: "nfkc_unicode_word_v1",
        confidence: position === null ? null : 1,
      },
    ];
  });
}
