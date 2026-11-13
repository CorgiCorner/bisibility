import { type BrandNameSet, matchBrandNamesInAnswer } from "@/lib/ai-tracking/brand-name-match";
import { projectBrandNameCounts } from "@/lib/ai-tracking/brand-name-projection";
import {
  AI_VISIBILITY_CANDIDATE_LIMIT,
  AI_VISIBILITY_OVERVIEW_ANSWER_LIMIT,
  type AiVisibilityOverview,
  citationHost,
  type OverviewBrandRow,
  type OverviewEntityInput,
  type OverviewProjectionInput,
  type OverviewSpellingRow,
} from "@/lib/ai-tracking/overview-model";
import { tallyOverviewAnswers } from "@/lib/ai-tracking/overview-tally";

/**
 * Read-side Overview definitions. Nothing here is stored back onto a sample.
 *
 * Answer: one stored tracking sample that already has an answer
 * (`measurement = answer_present`) inside the selected period, engine, topic
 * and market. The loader applies those filters. Every matching sample counts,
 * including another day of the same prompt, engine and configuration.
 *
 * Branded prompt: the prompt text names the own brand with the current names,
 * exclusions and matcher from brand-name matching. Unbranded means it does not.
 * The split is derived while reading and is never written to the prompt.
 *
 * Mentioned: the answer names the own brand under those same current names.
 *
 * Cited: at least one citation URL is on the project domain. Hosts match with
 * or without a leading `www`, and a subdomain does not count. The link count
 * is the number of those citation URLs.
 *
 * Brand mention: one (answer, entity) pair where the entity is named. Entities
 * are the own brand and the project's competitors. Share of voice is that
 * entity's brand mentions divided by all of those mentions in the filtered
 * answers. Zero mentions is an empty share, not 0%.
 *
 * Cited domains that are neither the own site nor a competitor are "seen in
 * answers" candidates. Their mention counts are unknown.
 */
export function projectAiVisibilityOverview(input: OverviewProjectionInput): AiVisibilityOverview {
  const own = input.entities.find((entity) => entity.kind === "project");
  if (!own) throw new Error("AI Visibility overview requires the project brand.");
  const entities = [own, ...input.entities.filter((entity) => entity.kind === "competitor")];
  const ownNames = nameSet(own);
  const selected = input.answers.flatMap((answer) => {
    const branded = matchBrandNamesInAnswer(answer.promptText, ownNames).named;
    if (input.promptKind === "branded" && !branded) return [];
    if (input.promptKind === "unbranded" && branded) return [];
    return [
      {
        ...answer,
        branded,
        mentioned: matchBrandNamesInAnswer(answer.answerText, ownNames).named,
      },
    ];
  });
  const texts = selected.map((answer) => answer.answerText);
  const counts = new Map(
    entities.map((entity) => [entity.id, projectBrandNameCounts(texts, nameSet(entity))] as const),
  );
  const reserved = new Set(
    entities.flatMap((entity) => {
      const host = entity.domain ? citationHost(entity.domain) : null;
      return host ? [host] : [];
    }),
  );
  const tally = tallyOverviewAnswers(selected, own, reserved, input.timeZone);
  const mentionTotal = [...counts.values()].reduce((sum, count) => sum + count.named, 0);
  const brands = brandRows(entities, counts, mentionTotal, tally, reserved);
  const leader = brands
    .filter((row) => row.kind !== "candidate" && (row.mentions ?? 0) > 0)
    .sort(byMentions)[0];
  return {
    brands,
    cited: {
      cited: tally.cited,
      links: tally.ownLinks,
      total: selected.length,
      unbrandedCited: tally.unbrandedCited,
      unbrandedTotal: tally.unbranded,
    },
    coverage: {
      costMicros: tally.costMicros,
      dates: tally.days.map((day) => day.day),
      engines: tally.engines.map((row) => row.engine),
    },
    days: tally.days,
    engines: tally.engines,
    insight: tally.insight,
    limit: AI_VISIBILITY_OVERVIEW_ANSWER_LIMIT,
    mentioned: {
      named: tally.named,
      total: selected.length,
      unbrandedNamed: tally.unbrandedNamed,
      unbrandedTotal: tally.unbranded,
    },
    project: { domain: own.domain, label: own.label },
    shareOfVoice:
      mentionTotal > 0 && leader
        ? {
            leader: {
              label: leader.label,
              mentions: leader.mentions ?? 0,
              own: leader.kind === "project",
            },
            mentions: counts.get(own.id)?.named ?? 0,
            total: mentionTotal,
          }
        : null,
    spellings: spellingRows(entities, counts),
    totalAnswers: selected.length,
    truncated: input.truncated,
  };
}

function nameSet(entity: OverviewEntityInput): BrandNameSet {
  return {
    aliases: entity.aliases,
    domain: entity.domain,
    excludedNames: entity.excludedNames,
    label: entity.label,
  };
}

function linksFor(domain: string | null, linksByHost: ReadonlyMap<string, number>) {
  const host = domain ? citationHost(domain) : null;
  return host ? (linksByHost.get(host) ?? 0) : 0;
}

function brandRows(
  entities: readonly OverviewEntityInput[],
  counts: ReadonlyMap<string, ReturnType<typeof projectBrandNameCounts>>,
  mentionTotal: number,
  tally: ReturnType<typeof tallyOverviewAnswers>,
  reserved: ReadonlySet<string>,
): OverviewBrandRow[] {
  const configured = entities
    .map((entity) => {
      const count = counts.get(entity.id);
      const mentions = count?.named ?? 0;
      return {
        aliases: entity.aliases,
        answersNamed: mentions,
        domain: entity.domain,
        excludedNames: entity.excludedNames,
        id: entity.id,
        kind: entity.kind,
        label: entity.label,
        links: linksFor(entity.domain, tally.linksByHost),
        mentions,
        nameCounts: count?.names ?? [],
        share: mentions > 0 && mentionTotal > 0 ? { mentions, total: mentionTotal } : null,
      } satisfies OverviewBrandRow;
    })
    .sort(byMentions);
  const seen = [...tally.seen.entries()]
    .filter(([domain]) => !reserved.has(domain))
    .sort(
      (left, right) =>
        right[1].answers - left[1].answers ||
        right[1].links - left[1].links ||
        left[0].localeCompare(right[0]),
    )
    .slice(0, AI_VISIBILITY_CANDIDATE_LIMIT)
    .map(([domain, value]) => ({
      aliases: [],
      answersNamed: null,
      domain,
      excludedNames: [],
      id: `seen:${domain}`,
      kind: "candidate" as const,
      label: domain,
      links: value.links,
      mentions: null,
      nameCounts: [],
      share: null,
    }));
  return [...configured, ...seen];
}

function byMentions(left: OverviewBrandRow, right: OverviewBrandRow) {
  const mentions = (right.mentions ?? 0) - (left.mentions ?? 0);
  if (mentions) return mentions;
  if (left.kind !== right.kind) return left.kind === "project" ? -1 : 1;
  return left.label.localeCompare(right.label, "en");
}

function spellingRows(
  entities: readonly OverviewEntityInput[],
  counts: ReadonlyMap<string, ReturnType<typeof projectBrandNameCounts>>,
): OverviewSpellingRow[] {
  return entities.flatMap((entity) => {
    const count = counts.get(entity.id);
    if (!count || count.names.length < 2) return [];
    const aliases = new Set(entity.aliases);
    return [
      {
        entityId: entity.id,
        kind: entity.kind,
        label: entity.label,
        mentions: count.named,
        names: count.names,
        removable: count.names.flatMap((name) => (aliases.has(name.name) ? [name.name] : [])),
      },
    ];
  });
}
