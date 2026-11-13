import { matchBrandNamesInAnswer } from "@/lib/ai-tracking/brand-name-match";
import {
  classifySourceDomain,
  registrableSourceDomain,
  type SourceClassContext,
  type SourceDisplayType,
  type SourceOverrideType,
} from "@/lib/ai-tracking/source-types";
import { csvRow } from "@/lib/ui/csv";

export type PlaygroundEntity = {
  aliases: readonly string[];
  domain: string | null;
  excludedNames: readonly string[];
  id: string;
  kind: "competitor" | "project";
  label: string;
};

export type PlaygroundCitation = { title?: string; url: string };

export type PlaygroundTopic = { id: string; name: string };

export type PlaygroundSourceOverride = { domain: string; type: SourceOverrideType };

export type PlaygroundVerdict = {
  cited: boolean;
  kind: "absent" | "cited" | "named" | "named_cited";
  position: number | null;
};

export type PlaygroundMention = {
  cited: boolean;
  entity: PlaygroundEntity;
  position: number;
};

export type MatrixCell =
  | { kind: "no" }
  | { kind: "not_named" }
  | { cited: boolean; kind: "position"; position: number };

export type PlaygroundAnswer = {
  citations: readonly PlaygroundCitation[];
  id: string;
  text: string | null;
};

export type PlaygroundCitedDomain = {
  count: number;
  domain: string;
  engines: string[];
  type: SourceDisplayType;
};

type ClassContext = Omit<SourceClassContext, "override"> & {
  overrides: readonly PlaygroundSourceOverride[];
};

/** Brands named in one answer, in the order of their first mention. */
export function playgroundMentions(
  answer: string,
  citations: readonly PlaygroundCitation[],
  entities: readonly PlaygroundEntity[],
): PlaygroundMention[] {
  return entities
    .flatMap((entity) => {
      const match = matchBrandNamesInAnswer(answer, {
        aliases: entity.aliases,
        domain: entity.domain,
        excludedNames: entity.excludedNames,
        label: entity.label,
      });
      if (!match.named || match.position === null) return [];
      return [{ entity, index: match.position }];
    })
    .sort(
      (left, right) => left.index - right.index || left.entity.id.localeCompare(right.entity.id),
    )
    .map((item, index) => ({
      cited: domainCited(item.entity.domain, citations),
      entity: item.entity,
      position: index + 1,
    }));
}

/** Project verdict from the AI-2 matcher and the answer's citations. */
export function playgroundVerdict(
  answer: string,
  citations: readonly PlaygroundCitation[],
  entities: readonly PlaygroundEntity[],
): PlaygroundVerdict {
  const project = entities.find((entity) => entity.kind === "project");
  const mention = playgroundMentions(answer, citations, entities).find(
    (item) => item.entity.kind === "project",
  );
  const cited = domainCited(project?.domain ?? null, citations);
  if (mention && cited) return { cited: true, kind: "named_cited", position: mention.position };
  if (mention) return { cited: false, kind: "named", position: mention.position };
  if (cited) return { cited: true, kind: "cited", position: null };
  return { cited: false, kind: "absent", position: null };
}

/** Rows are the project and competitors named in at least one answer. */
export function playgroundMatrix(
  columns: readonly PlaygroundAnswer[],
  entities: readonly PlaygroundEntity[],
) {
  const mentions = columns.map((column) =>
    column.text === null ? [] : playgroundMentions(column.text, column.citations, entities),
  );
  const named = new Set(mentions.flatMap((column) => column.map((item) => item.entity.id)));
  return entities
    .filter((entity) => named.has(entity.id))
    .map((entity) => ({
      entity,
      cells: mentions.map((column): MatrixCell => {
        const mention = column.find((item) => item.entity.id === entity.id);
        if (!mention) return entity.kind === "project" ? { kind: "not_named" } : { kind: "no" };
        return { cited: mention.cited, kind: "position", position: mention.position };
      }),
    }));
}

export function playgroundMatrixCellText(
  cell: MatrixCell,
  labels: {
    absent: string;
    notNamed: string;
    position: (position: number) => string;
    positionCited: (position: number) => string;
  },
) {
  if (cell.kind === "no") return labels.absent;
  if (cell.kind === "not_named") return labels.notNamed;
  return cell.cited ? labels.positionCited(cell.position) : labels.position(cell.position);
}

export function playgroundMatrixCsv(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
) {
  return [headers, ...rows].map((row) => csvRow(row)).join("\n");
}

export function playgroundCitedDomains(
  columns: readonly { citations: readonly PlaygroundCitation[]; label: string }[],
  context: ClassContext,
): PlaygroundCitedDomain[] {
  const grouped = new Map<string, { count: number; engines: string[] }>();
  for (const column of columns) {
    const seen = new Set<string>();
    for (const citation of column.citations) {
      const domain = registrableSourceDomain(citation.url);
      if (!domain) continue;
      const entry = grouped.get(domain) ?? { count: 0, engines: [] };
      entry.count += 1;
      if (!seen.has(domain)) {
        seen.add(domain);
        entry.engines.push(column.label);
      }
      grouped.set(domain, entry);
    }
  }
  return [...grouped.entries()]
    .map(([domain, entry]) => ({
      count: entry.count,
      domain,
      engines: entry.engines,
      type: classifyPlaygroundDomain(domain, context),
    }))
    .sort((left, right) => right.count - left.count || left.domain.localeCompare(right.domain));
}

export type PlaygroundColumnRequest = { id: string; label: string; model: string | null };

export type PlaygroundColumn = PlaygroundColumnRequest & {
  answer: string | null;
  citations: PlaygroundCitation[];
  failed: boolean;
  observedAt: string | null;
};

/** One column per requested engine or model. A missing answer is a failed column. */
export function playgroundColumns(
  requested: readonly PlaygroundColumnRequest[],
  rows: readonly {
    answer: string;
    citations: readonly PlaygroundCitation[];
    engine?: string;
    model: string;
    observedAt: string | null;
  }[],
  unfinished: boolean,
): PlaygroundColumn[] {
  return requested.map((column) => {
    const row = rows.find((item) => item.engine === column.id || item.model === column.id);
    if (!row) {
      return { ...column, answer: null, citations: [], failed: unfinished, observedAt: null };
    }
    return {
      ...column,
      answer: row.answer,
      citations: [...row.citations],
      failed: false,
      model: column.model ?? row.model,
      observedAt: row.observedAt,
    };
  });
}

export function classifyPlaygroundDomain(domain: string, context: ClassContext): SourceDisplayType {
  const key = registrableSourceDomain(domain);
  const override =
    context.overrides.find((item) => registrableSourceDomain(item.domain) === key)?.type ?? null;
  return classifySourceDomain(domain, {
    catalog: context.catalog,
    competitorDomains: context.competitorDomains,
    excludedNames: context.excludedNames,
    override,
    ownDomain: context.ownDomain,
  }).type;
}

function domainCited(domain: string | null, citations: readonly PlaygroundCitation[]) {
  const target = domain ? registrableSourceDomain(domain) : null;
  if (!target) return false;
  return citations.some((citation) => registrableSourceDomain(citation.url) === target);
}
