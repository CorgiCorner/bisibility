import {
  AI_VISIBILITY_INSIGHT_DOMAIN_LIMIT,
  citationHost,
  hostOnSite,
  type OverviewAnswerInput,
  type OverviewDay,
  type OverviewEngineRow,
  type OverviewEntityInput,
  type OverviewInsight,
  overviewDayKey,
} from "@/lib/ai-tracking/overview-model";

export type ReadyAnswer = OverviewAnswerInput & { branded: boolean; mentioned: boolean };

export type AnswerTally = {
  cited: number;
  costMicros: number | null;
  days: readonly OverviewDay[];
  engines: readonly OverviewEngineRow[];
  insight: OverviewInsight | null;
  linksByHost: ReadonlyMap<string, number>;
  named: number;
  ownLinks: number;
  seen: ReadonlyMap<string, { answers: number; links: number }>;
  unbranded: number;
  unbrandedCited: number;
  unbrandedNamed: number;
};

export function tallyOverviewAnswers(
  answers: readonly ReadyAnswer[],
  own: OverviewEntityInput,
  reservedHosts: ReadonlySet<string>,
  timeZone: string,
): AnswerTally {
  const linksByHost = new Map<string, number>();
  const seen = new Map<string, { answers: number; links: number }>();
  const engines = new Map<
    string,
    { answers: number; cited: number; named: number; providers: Set<string> }
  >();
  const days = new Map<string, { answers: number; cited: number; mentioned: number }>();
  const insightHosts = new Map<string, { answers: number; links: number }>();
  const insightEngines = new Set<string>();
  let cited = 0;
  let costMicros: number | null = null;
  let insightAnswers = 0;
  let insightOwnLinks = 0;
  let insightTotalLinks = 0;
  let named = 0;
  let ownLinks = 0;
  let unbranded = 0;
  let unbrandedCited = 0;
  let unbrandedNamed = 0;

  for (const answer of answers) {
    const hosts = answer.citations.flatMap((citation) => {
      const host = citationHost(citation.url);
      return host ? [host] : [];
    });
    const links = hosts.filter((host) => hostOnSite(host, own.domain)).length;
    const isCited = links > 0;
    if (answer.mentioned) named += 1;
    if (isCited) cited += 1;
    ownLinks += links;
    if (!answer.branded) {
      unbranded += 1;
      if (answer.mentioned) unbrandedNamed += 1;
      if (isCited) unbrandedCited += 1;
    }
    if (answer.costMicros !== null) costMicros = (costMicros ?? 0) + answer.costMicros;
    countHosts(linksByHost, seen, hosts, reservedHosts);
    addEngine(engines, answer, isCited);
    addDay(days, answer, timeZone, isCited);
    if (!answer.branded && !answer.mentioned) {
      insightAnswers += 1;
      insightEngines.add(answer.engine);
      insightOwnLinks += links;
      insightTotalLinks += hosts.length;
      countInsight(insightHosts, hosts, own.domain);
    }
  }

  return {
    cited,
    costMicros,
    days: [...days.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([day, value]) => ({
        answers: value.answers,
        citedShare: value.cited / value.answers,
        day,
        mentionedShare: value.mentioned / value.answers,
      })),
    engines: [...engines.entries()]
      .map(([engine, value]) => ({
        answers: value.answers,
        cited: value.cited,
        engine,
        named: value.named,
        providers: [...value.providers].sort(),
      }))
      .sort(
        (left, right) => right.answers - left.answers || left.engine.localeCompare(right.engine),
      ),
    insight: insightAnswers
      ? {
          answers: insightAnswers,
          domain: own.domain,
          domains: topDomains(insightHosts),
          engines: [...insightEngines].sort(),
          ownLinks: insightOwnLinks,
          totalLinks: insightTotalLinks,
        }
      : null,
    linksByHost,
    named,
    ownLinks,
    seen,
    unbranded,
    unbrandedCited,
    unbrandedNamed,
  };
}

function countHosts(
  linksByHost: Map<string, number>,
  seen: Map<string, { answers: number; links: number }>,
  hosts: readonly string[],
  reservedHosts: ReadonlySet<string>,
) {
  const visited = new Set<string>();
  for (const host of hosts) {
    linksByHost.set(host, (linksByHost.get(host) ?? 0) + 1);
    if (reservedHosts.has(host)) continue;
    const current = seen.get(host) ?? { answers: 0, links: 0 };
    current.links += 1;
    if (!visited.has(host)) {
      current.answers += 1;
      visited.add(host);
    }
    seen.set(host, current);
  }
}

function countInsight(
  hosts: Map<string, { answers: number; links: number }>,
  citations: readonly string[],
  ownDomain: string | null,
) {
  const visited = new Set<string>();
  for (const host of citations) {
    if (hostOnSite(host, ownDomain)) continue;
    const current = hosts.get(host) ?? { answers: 0, links: 0 };
    current.links += 1;
    if (!visited.has(host)) {
      current.answers += 1;
      visited.add(host);
    }
    hosts.set(host, current);
  }
}

function addEngine(
  engines: Map<string, { answers: number; cited: number; named: number; providers: Set<string> }>,
  answer: ReadyAnswer,
  cited: boolean,
) {
  const current = engines.get(answer.engine) ?? {
    answers: 0,
    cited: 0,
    named: 0,
    providers: new Set<string>(),
  };
  current.answers += 1;
  if (answer.mentioned) current.named += 1;
  if (cited) current.cited += 1;
  if (answer.provider) current.providers.add(answer.provider);
  engines.set(answer.engine, current);
}

function addDay(
  days: Map<string, { answers: number; cited: number; mentioned: number }>,
  answer: ReadyAnswer,
  timeZone: string,
  cited: boolean,
) {
  if (!answer.finishedAt) return;
  const key = overviewDayKey(answer.finishedAt, timeZone);
  if (!key) return;
  const current = days.get(key) ?? { answers: 0, cited: 0, mentioned: 0 };
  current.answers += 1;
  if (answer.mentioned) current.mentioned += 1;
  if (cited) current.cited += 1;
  days.set(key, current);
}

function topDomains(hosts: ReadonlyMap<string, { answers: number; links: number }>) {
  return [...hosts.entries()]
    .sort(
      (left, right) =>
        right[1].answers - left[1].answers ||
        right[1].links - left[1].links ||
        left[0].localeCompare(right[0]),
    )
    .slice(0, AI_VISIBILITY_INSIGHT_DOMAIN_LIMIT)
    .map(([domain]) => domain);
}
