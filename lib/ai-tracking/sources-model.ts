import { matchBrandNamesInAnswer } from "@/lib/ai-tracking/brand-name-match";
import {
  AI_VISIBILITY_OVERVIEW_ANSWER_LIMIT,
  type OverviewAnswerInput,
  type OverviewFilters,
  type OverviewMarketOption,
  type OverviewPromptKind,
} from "@/lib/ai-tracking/overview-model";
import type { SourceCatalog } from "./source-catalog";
import {
  classifySourceDomain,
  registrableSourceDomain,
  type SourceClass,
  type SourceDisplayType,
  type SourceOrigin,
  type SourceOverrideType,
} from "./source-types";

export const AI_SOURCE_PLAN_STATES = ["todo", "done", "dismissed"] as const;
export type AiSourcePlanState = (typeof AI_SOURCE_PLAN_STATES)[number];

export type AiSourceRow = {
  answers: number;
  domain: string;
  id: string;
  links: number;
  origin: SourceOrigin;
  planState: AiSourcePlanState | null;
  type: SourceDisplayType;
  url: string | null;
};

export type AiSourcePlanRow = {
  domain: string;
  note: string | null;
  state: AiSourcePlanState;
  type: SourceDisplayType;
  url: string | null;
};

export type AiVisibilitySources = {
  citedDomains: number;
  limit: number;
  pages: readonly AiSourceRow[];
  plan: readonly AiSourcePlanRow[];
  rows: readonly AiSourceRow[];
  totalAnswers: number;
  truncated: boolean;
  unnamedOtherDomains: number;
  withoutNameLinks: number;
  yourSite: { allNamed: boolean; links: number; unnamedLinks: number };
};

export type AiVisibilitySourcesLoad = {
  canWrite: boolean;
  engines: readonly string[];
  filters: OverviewFilters;
  hasAnswers: boolean;
  markets: readonly OverviewMarketOption[];
  sources: AiVisibilitySources;
  topics: readonly { id: string; name: string }[];
};

export type SourceProjectionInput = {
  answers: readonly OverviewAnswerInput[];
  catalog?: SourceCatalog;
  competitors: readonly { domain: string }[];
  overrides: readonly { domain: string; type: SourceOverrideType }[];
  own: {
    aliases: readonly string[];
    domain: string | null;
    excludedNames: readonly string[];
    label: string;
  };
  plan: readonly {
    domain: string;
    note: string | null;
    state: AiSourcePlanState;
    url: string | null;
  }[];
  promptKind: OverviewPromptKind;
  truncated: boolean;
};

type Bucket = { answers: Set<string>; domain: string; links: number; url: string | null };

function selectedAnswers(input: SourceProjectionInput) {
  const names = {
    aliases: input.own.aliases,
    domain: input.own.domain,
    excludedNames: input.own.excludedNames,
    label: input.own.label,
  };
  return input.answers.flatMap((answer) => {
    const branded = matchBrandNamesInAnswer(answer.promptText, names).named;
    if (input.promptKind === "branded" && !branded) return [];
    if (input.promptKind === "unbranded" && branded) return [];
    return [{ ...answer, named: matchBrandNamesInAnswer(answer.answerText, names).named }];
  });
}

function classFor(
  domain: string,
  input: SourceProjectionInput,
  override: SourceOverrideType | null,
): SourceClass {
  return classifySourceDomain(domain, {
    catalog: input.catalog,
    competitorDomains: input.competitors.map((competitor) => competitor.domain),
    excludedNames: input.own.excludedNames,
    override,
    ownDomain: input.own.domain,
  });
}

function rowFrom(
  bucket: Bucket,
  input: SourceProjectionInput,
  planState: AiSourcePlanState | null,
) {
  const override = input.overrides.find((item) => item.domain === bucket.domain)?.type ?? null;
  const source = classFor(bucket.domain, input, override);
  return {
    answers: bucket.answers.size,
    domain: bucket.domain,
    id: bucket.url ?? bucket.domain,
    links: bucket.links,
    origin: source.origin,
    planState,
    type: source.type,
    url: bucket.url,
  } satisfies AiSourceRow;
}

function byLinks(left: AiSourceRow, right: AiSourceRow) {
  return (
    right.links - left.links ||
    left.domain.localeCompare(right.domain) ||
    left.id.localeCompare(right.id)
  );
}

/** Domains and pages cited by the filtered answers, typed and joined to the plan. */
export function projectAiVisibilitySources(input: SourceProjectionInput): AiVisibilitySources {
  const selected = selectedAnswers(input);
  const ownDomain = input.own.domain ? registrableSourceDomain(input.own.domain) : null;
  const domains = new Map<string, Bucket>();
  const pages = new Map<string, Bucket>();
  const unnamedOther = new Set<string>();
  let ownLinks = 0;
  let unnamedOwnLinks = 0;

  for (const answer of selected) {
    const seenDomains = new Set<string>();
    const seenUrls = new Set<string>();
    for (const citation of answer.citations) {
      const domain = registrableSourceDomain(citation.url);
      const url = citation.url.trim();
      if (!domain || !url) continue;
      const domainBucket = domains.get(domain) ?? {
        answers: new Set<string>(),
        domain,
        links: 0,
        url: null,
      };
      domainBucket.links += 1;
      if (!seenDomains.has(domain)) {
        domainBucket.answers.add(answer.id);
        seenDomains.add(domain);
      }
      domains.set(domain, domainBucket);
      const pageBucket = pages.get(url) ?? { answers: new Set<string>(), domain, links: 0, url };
      pageBucket.links += 1;
      if (!seenUrls.has(url)) {
        pageBucket.answers.add(answer.id);
        seenUrls.add(url);
      }
      pages.set(url, pageBucket);
      if (domain === ownDomain) {
        ownLinks += 1;
        if (!answer.named) unnamedOwnLinks += 1;
      } else if (!answer.named) {
        unnamedOther.add(domain);
      }
    }
  }

  const planByDomain = new Map(input.plan.map((item) => [item.domain, item]));
  const rows = [...domains.values()]
    .map((bucket) => rowFrom(bucket, input, planByDomain.get(bucket.domain)?.state ?? null))
    .sort(byLinks);
  const pageRows = [...pages.values()]
    .map((bucket) => rowFrom(bucket, input, planByDomain.get(bucket.domain)?.state ?? null))
    .sort(byLinks);

  return {
    citedDomains: domains.size,
    limit: AI_VISIBILITY_OVERVIEW_ANSWER_LIMIT,
    pages: pageRows,
    plan: [...input.plan]
      .map((item) => {
        const override =
          input.overrides.find((entry) => entry.domain === item.domain)?.type ?? null;
        return {
          domain: item.domain,
          note: item.note,
          state: item.state,
          type: classFor(item.domain, input, override).type,
          url: item.url,
        };
      })
      .sort((left, right) => left.domain.localeCompare(right.domain)),
    rows,
    totalAnswers: selected.length,
    truncated: input.truncated,
    unnamedOtherDomains: unnamedOther.size,
    withoutNameLinks: unnamedOwnLinks,
    yourSite: {
      allNamed: ownLinks > 0 && unnamedOwnLinks === 0,
      links: ownLinks,
      unnamedLinks: unnamedOwnLinks,
    },
  };
}
