import {
  BRAND_NAME_MATCH_POLICY,
  matchBrandNamesInAnswer,
  positiveBrandNames,
} from "@/lib/ai-tracking/brand-name-match";
import type { EntityObservationInput, JsonValue } from "@/lib/ai-tracking/contract";

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function trackingEntityObservations(
  answer: string | null,
  snapshot: JsonValue,
): EntityObservationInput[] {
  if (!answer || !Array.isArray(snapshot)) return [];
  return snapshot.flatMap((entity) => {
    if (
      !entity ||
      typeof entity !== "object" ||
      Array.isArray(entity) ||
      typeof entity.id !== "string"
    )
      return [];
    const names = {
      aliases: stringList(entity.aliases),
      domain: typeof entity.domain === "string" ? entity.domain : null,
      excludedNames: stringList(entity.excludedNames),
      label: typeof entity.label === "string" ? entity.label : null,
    };
    const name = names.label || names.domain || "";
    const aliases = positiveBrandNames(names);
    const match = matchBrandNamesInAnswer(answer, names);
    return [
      {
        aliases,
        competitorId: entity.kind === "project" ? null : entity.id,
        confidence: match.position === null ? null : 1,
        entityKey: entity.id,
        matchPolicy: BRAND_NAME_MATCH_POLICY,
        mentioned: match.named,
        name,
        position: match.position,
        snippet:
          match.position === null
            ? null
            : answer.slice(Math.max(0, match.position - 100), match.position + 200),
      },
    ];
  });
}
