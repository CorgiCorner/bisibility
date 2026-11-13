"use client";

import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ValueBar } from "@/components/ui/ValueBar";
import {
  type AnswerHighlightEntity,
  highlightAnswerBrands,
} from "@/lib/ai-tracking/answer-highlight";
import { citedSourceSummary } from "@/lib/ai-tracking/cited-sources";
import type { Evidence } from "@/lib/ai-tracking/contract";
import type { OverviewEntityInput } from "@/lib/ai-tracking/overview-model";
import type { TrackingSampleRow } from "@/lib/ai-tracking/projections/workspace";
import { formatPromptUsd } from "@/lib/ai-tracking/prompt-format";
import type { PromptPanelAnswer } from "@/lib/ai-tracking/prompts-model";
import { useTranslations } from "next-intl";
import { AiVisibilityAnswerText } from "./AiVisibilityAnswerText";
import {
  type OverviewEngineCopy,
  overviewEngineLabel,
  overviewProviderLabel,
} from "./overview-labels";

export function highlightEntities(
  entities: readonly OverviewEntityInput[],
): AnswerHighlightEntity[] {
  return entities.map((entity) => ({
    id: entity.id,
    kind: entity.kind,
    label: entity.label,
    names: {
      aliases: entity.aliases,
      domain: entity.domain,
      excludedNames: entity.excludedNames,
      label: entity.label,
    },
  }));
}

type Translate = ReturnType<typeof useTranslations<"projectAiTracking">>;

export function askedLabel(source: PromptPanelAnswer["source"], translate: Translate) {
  if (source === "google_aio") return translate("promptsTab.askedOverview");
  if (source === "model_api") return translate("promptsTab.askedModel");
  return translate("promptsTab.askedUsers");
}

export function receiptCost(costUsd: string | null, locale: string) {
  if (!costUsd) return null;
  const amount = Number(costUsd);
  if (!Number.isFinite(amount)) return null;
  return formatPromptUsd(amount, locale);
}

export function answerSample(prompt: string, answer: PromptPanelAnswer): TrackingSampleRow {
  const observedAt = answer.finishedAt ?? "1970-01-01T00:00:00.000Z";
  const evidence: Evidence = {
    actualModel: null,
    answerText: answer.text,
    answerTruncated: false,
    effectiveLocale: null,
    fetchedAt: observedAt,
    localeMechanism: null,
    observedAt,
    providerStatus: null,
    raw: null,
    rawTruncated: false,
    recordedSource: "fresh",
    requestedLocale: null,
    requestedModel: null,
    searchResults: [],
  };
  return {
    citations: answer.citations.map((citation) => ({
      position: citation.position,
      title: citation.title,
      url: citation.url,
    })),
    costState: answer.costState,
    costUsd: answer.costUsd,
    engine: answer.engine,
    evidence,
    id: answer.id,
    measurement: "answer_present",
    prompt,
    promptRevisionId: answer.promptRevisionId,
    source: answer.source,
  };
}

export function AiVisibilityPromptAnswer({
  answer,
  domain,
  engines,
  labels,
  names,
  onEngine,
  selected,
}: Readonly<{
  answer: PromptPanelAnswer;
  domain: string | null;
  engines: readonly string[];
  labels: OverviewEngineCopy;
  names: readonly AnswerHighlightEntity[];
  onEngine: (engine: string) => void;
  selected: string;
}>) {
  const t = useTranslations("projectAiTracking");
  const highlight = highlightAnswerBrands(answer.text, names);
  const sources = citedSourceSummary(answer.citations, domain);
  const widest = Math.max(1, ...sources.map((source) => source.links));
  return (
    <div className="flex flex-col gap-4">
      {engines.length > 0 ? (
        <SegmentedControl
          ariaLabel={t("promptsTab.engines")}
          onChange={onEngine}
          options={engines.map((item) => ({
            label: overviewEngineLabel(item, labels),
            value: item,
          }))}
          size="field"
          value={selected}
        />
      ) : null}
      <AiVisibilityAnswerText entities={names} text={answer.text} />
      {highlight.brands.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="m-0 text-sm font-semibold">{t("promptsTab.brandsInAnswer")}</h3>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
            {highlight.brands.map((brand) => (
              <li key={brand.id}>{brand.kind === "project" ? t("overview.you") : brand.label}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {sources.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="m-0 text-sm font-semibold">{t("promptsTab.citedSources")}</h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {sources.map((source) => (
              <li className="flex min-w-0 items-center gap-2" key={source.host}>
                <span className="w-36 truncate text-xs">{source.host}</span>
                <ValueBar max={widest} tone="positive" value={source.links} />
                <span className="text-xs tabular-nums">{source.links}</span>
                {source.own ? (
                  <span className="text-xs text-blue-text">{t("overview.you")}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export function promptProvenanceLine(
  answer: PromptPanelAnswer,
  locale: string,
  translate: Translate,
  when: string,
) {
  return translate("promptsTab.provenance", {
    asked: askedLabel(answer.source, translate),
    cost: receiptCost(answer.costUsd, locale) ?? translate("promptsTab.costUnknown"),
    provider: answer.provider
      ? overviewProviderLabel(answer.provider)
      : translate("overview.unknownProvider"),
    when,
  });
}
