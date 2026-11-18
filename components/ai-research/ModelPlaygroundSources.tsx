"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ProviderLogo } from "@/components/ui/ProviderLogo";
import type { ResultColumn } from "@/lib/model-playground/result-view";
import { MODEL_PROVIDER_CATALOG } from "@/lib/providers/model/catalog-metadata";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import "./ModelPlaygroundColumns.css";
import { ModelPlaygroundLegacySources } from "./ModelPlaygroundLegacySources";

type Source = {
  url: string;
  title: string | null;
  occurrenceId?: string;
  start?: number | null;
  end?: number | null;
};
function linkDomain(source: Source) {
  try {
    const url = new URL(source.url);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
      ? url.hostname
      : null;
  } catch {
    return null;
  }
}
function sourceGroups(sources: readonly Source[]) {
  const groups = new Map<string | null, Source[]>();
  for (const source of sources) {
    const domain = linkDomain(source);
    groups.set(domain, [...(groups.get(domain) ?? []), source]);
  }
  return [...groups];
}
function SourceList({
  sources,
  total,
  omitted,
  truncated,
  citations = false,
}: Readonly<{
  sources: readonly Source[];
  total: number | null;
  omitted: number | null;
  truncated: boolean;
  citations?: boolean;
}>) {
  const c = useTranslations("projectAiResearch.modelPlayground");
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return (
    <section className="grid min-w-0 gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 text-ui-caption font-medium">
          {c(citations ? "citationOccurrences" : "providerSources")}
        </h3>
        <span className="text-ui-caption text-fg-muted">
          {total === null ? c("totalUnknown") : c("sourcesAll", { count: total })}
        </span>
      </div>
      {truncated || total === null ? (
        <p className="m-0 text-ui-caption text-fg-muted">
          {truncated ? `${c(citations ? "citationsTruncated" : "sourceListTruncated")}. ` : ""}
          {omitted === null
            ? c("omittedUnknown", { retained: sources.length })
            : c("retentionCounts", { retained: sources.length, omitted })}
        </p>
      ) : null}
      <div className="grid min-w-0 gap-2" id={id}>
        {sourceGroups(expanded ? sources : sources.slice(0, 3)).map(([domain, records]) => (
          <div className="grid min-w-0 gap-1" key={domain ?? "unlinked"}>
            <p className="m-0 text-ui-caption font-medium">{domain ?? c("unlinkedSources")}</p>
            <ul className="m-0 grid min-w-0 list-none gap-1 p-0">
              {records.map((source, index) => (
                <li
                  className="text-ui-caption model-playground-wrap"
                  key={source.occurrenceId ?? `${source.url}-${index}`}
                >
                  {source.title ? (
                    <span className="block text-fg-muted">{source.title}</span>
                  ) : null}
                  {domain ? (
                    <a
                      className="underline"
                      href={source.url}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {source.url}
                    </a>
                  ) : (
                    <span>{source.url || c("emptySource")}</span>
                  )}
                  {citations && source.start != null && source.end != null ? (
                    <span className="block text-fg-muted">
                      {c("sourceRange", { start: source.start, end: source.end })}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {sources.length > 3 ? (
        <Button
          aria-controls={id}
          aria-expanded={expanded}
          className="model-playground-disclosure justify-self-start"
          onClick={() => setExpanded(!expanded)}
          size="sm"
          variant="outline"
        >
          {c(
            citations
              ? expanded
                ? "hideCitations"
                : "showCitations"
              : expanded
                ? "hideSources"
                : "showSources",
          )}
        </Button>
      ) : null}
    </section>
  );
}
export function ModelPlaygroundSources({
  columns,
  compact = false,
}: Readonly<{ columns: readonly ResultColumn[]; compact?: boolean }>) {
  const c = useTranslations("projectAiResearch.modelPlayground");
  if (columns.every((column) => column.legacySources !== null)) {
    return <ModelPlaygroundLegacySources columns={columns} compact={compact} />;
  }
  return (
    <div className="grid min-w-0 gap-4">
      {columns.map((column) => {
        const provider = MODEL_PROVIDER_CATALOG.find((item) => item.id === column.providerId);
        return (
          <Card className="gap-3" key={column.id}>
            {!compact ? (
              <header className="flex min-w-0 items-start gap-2">
                {provider ? (
                  <span aria-hidden className="shrink-0">
                    <ProviderLogo
                      alt=""
                      appearance="bare"
                      domain={provider.logoDomain}
                      fallbackIcon="globe"
                      size="xs"
                      theme="auto"
                      tint="var(--fg-muted)"
                    />
                  </span>
                ) : null}
                <div className="grid min-w-0 gap-0.5">
                  <h2 className="m-0 text-ui-body font-medium model-playground-wrap">
                    {column.label}
                  </h2>
                  {column.providerLabel ? (
                    <span className="text-ui-caption text-fg-muted">{column.providerLabel}</span>
                  ) : null}
                </div>
              </header>
            ) : null}
            {!column.consultedSources.sources.length && !column.citations.length ? (
              <p className="m-0 text-ui-body text-fg-muted">{c("noRetainedSources")}</p>
            ) : (
              <>
                <SourceList {...column.consultedSources} />
                <SourceList
                  sources={column.citations}
                  {...column.citationTotals}
                  truncated={column.truncation.citations}
                  citations
                />
              </>
            )}
          </Card>
        );
      })}
    </div>
  );
}
