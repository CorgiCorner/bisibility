"use client";

import { AiVisibilityAnswerText } from "@/components/ai-tracking/AiVisibilityAnswerText";
import { Modal } from "@/components/ui/Modal";
import type { PlaygroundEntity } from "@/lib/ai-research/model-playground-view";
import {
  hasCompleteAnswer,
  type ResultColumn,
  resultMentions,
  resultVerdict,
} from "@/lib/model-playground/result-view";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { ModelPlaygroundColumnFooter } from "./ModelPlaygroundColumnFooter";
import { ModelPlaygroundColumnFrame } from "./ModelPlaygroundColumnFrame";
import {
  type ModelPlaygroundDraftCard,
  ModelPlaygroundIdleColumn,
} from "./ModelPlaygroundIdleColumn";
import "./ModelPlaygroundColumns.css";
import { ModelPlaygroundSources } from "./ModelPlaygroundSources";
import { useModelPlaygroundScroll } from "./useModelPlaygroundScroll";

export function ModelPlaygroundColumns({
  columns,
  entities,
  onRemove,
  onSettings,
  running = false,
  draftCards,
  addColumn,
  disabled,
  previousRunNotice,
  previousAnswerTemplate,
}: Readonly<{
  columns: readonly ResultColumn[];
  entities: readonly PlaygroundEntity[];
  onRemove: (id: string) => void;
  onSettings?: (id: string) => void;
  running?: boolean;
  draftCards?: readonly ModelPlaygroundDraftCard[];
  addColumn?: ReactNode;
  disabled?: boolean;
  previousRunNotice?: string;
  previousAnswerTemplate?: string;
}>) {
  const c = useTranslations("projectAiResearch.modelPlayground");
  const { edges, ref, onScroll } = useModelPlaygroundScroll();
  return (
    <div className="model-playground-frame">
      <section
        aria-label={c("scrollAnswers")}
        className="model-playground-scroll"
        onScroll={onScroll}
        ref={ref}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: The scroll viewport must be keyboard reachable.
        tabIndex={0}
      >
        <div className="model-playground-track gap-4">
          {(draftCards ?? columns).map((card) => {
            const column = columns.find((item) => item.id === card.id);
            return column ? (
              <AnswerColumn
                key={card.id}
                column={column}
                entities={entities}
                onRemove={onRemove}
                onSettings={onSettings}
                running={running}
                disabled={disabled}
                draftCard={draftCards?.find((item) => item.id === card.id)}
                previousRunNotice={previousRunNotice}
                previousAnswerTemplate={previousAnswerTemplate}
              />
            ) : (
              <ModelPlaygroundIdleColumn
                key={card.id}
                column={card as ModelPlaygroundDraftCard}
                onRemove={onRemove}
                onSettings={onSettings}
                disabled={disabled}
              />
            );
          })}
          {addColumn}
        </div>
      </section>
      <span
        aria-hidden
        className="model-playground-fade model-playground-start"
        data-edge="start"
        hidden={!edges.start}
      />
      <span
        aria-hidden
        className="model-playground-fade model-playground-end"
        data-edge="end"
        hidden={!edges.end}
      />
    </div>
  );
}
const ANSWER_PREVIEW_LENGTH = 360;

function AnswerColumn({
  column,
  entities,
  onRemove,
  onSettings,
  running,
  disabled,
  draftCard,
  previousRunNotice,
  previousAnswerTemplate,
}: Readonly<{
  column: ResultColumn;
  entities: readonly PlaygroundEntity[];
  onRemove: (id: string) => void;
  onSettings?: (id: string) => void;
  running: boolean;
  disabled?: boolean;
  draftCard?: ModelPlaygroundDraftCard;
  previousRunNotice?: string;
  previousAnswerTemplate?: string;
}>) {
  const t = useTranslations("projectAiResearch");
  const c = useTranslations("projectAiResearch.modelPlayground");
  const [open, setOpen] = useState(false);
  const verdict = resultVerdict(column, entities);
  const mentions = resultMentions(column, entities);
  const highlights = entities.map((entity) => ({
    ...entity,
    names: {
      aliases: entity.aliases,
      domain: entity.domain,
      excludedNames: entity.excludedNames,
      label: entity.label,
    },
  }));
  const verdictText =
    verdict.kind === "unknown"
      ? c("unknown")
      : verdict.kind === "named_cited"
        ? t("modelPlayground.verdictNamedCited", { position: verdict.position ?? 0 })
        : verdict.kind === "named"
          ? t("modelPlayground.verdictNamed", { position: verdict.position ?? 0 })
          : t(
              verdict.kind === "cited"
                ? "modelPlayground.verdictCited"
                : "modelPlayground.verdictAbsent",
            );
  return (
    <ModelPlaygroundColumnFrame
      column={draftCard ? { ...column, ...draftCard } : column}
      onRemove={onRemove}
      onSettings={onSettings}
      disabled={disabled}
    >
      {previousRunNotice ? (
        <p className="m-0 text-ui-caption text-fg-muted" data-previous-run>
          {previousRunNotice}{" "}
          {previousAnswerTemplate
            ?.replace("{model}", column.modelId ?? column.label)
            .replace("{provider}", column.providerLabel ?? column.providerId ?? "")}
        </p>
      ) : null}
      {draftCard?.blocked ? (
        <p className="m-0 text-ui-caption text-red-text" role="alert">
          {draftCard.description}
        </p>
      ) : null}
      {running && column.state === "pending" ? (
        <p className="m-0 text-ui-body" role="status">
          {t("modelPlayground.answers")}
        </p>
      ) : null}
      {column.state === "cancelled" ? (
        <p className="m-0 text-ui-body" role="status">
          {c("notStarted")}
        </p>
      ) : null}
      {column.state === "failed" || (column.state === "pending" && !running) ? (
        <p className="m-0 text-ui-body text-red-text" role="alert">
          {t("partialFailure")}
        </p>
      ) : null}
      {column.answer !== null ? (
        <div className="model-playground-answer">
          <AiVisibilityAnswerText
            entities={highlights}
            text={`${column.answer.slice(0, ANSWER_PREVIEW_LENGTH)}${column.answer.length > ANSWER_PREVIEW_LENGTH ? "…" : ""}`}
          />
        </div>
      ) : null}
      <p className="m-0 text-ui-body font-medium" data-column-verdict>
        {verdictText}
      </p>
      {!column.provenance ? (
        <>
          <div className="grid min-w-0 gap-1">
            <h3 className="m-0 text-ui-caption font-medium">
              {t("modelPlayground.brandsHeading")}
            </h3>
            {mentions.length ? (
              <ol className="m-0 grid gap-1 pl-5 text-ui-body">
                {mentions.map((mention) => (
                  <li key={mention.entity.id}>
                    {mention.entity.label}
                    {mention.entity.kind === "project" ? ` (${t("modelPlayground.you")})` : ""}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="m-0 text-ui-caption text-fg-muted">
                {hasCompleteAnswer(column) ? c("notNamed") : c("unknown")}
              </p>
            )}
          </div>
          <ModelPlaygroundSources columns={[column]} compact />
        </>
      ) : null}
      <ModelPlaygroundColumnFooter
        column={column}
        onFullAnswer={
          column.answer !== null &&
          (!column.provenance ||
            column.answer.length > ANSWER_PREVIEW_LENGTH ||
            Object.values(column.truncation).some(Boolean))
            ? () => setOpen(true)
            : undefined
        }
      />
      <Modal
        onClose={() => setOpen(false)}
        open={open}
        size="lg"
        title={
          column.provenance || column.legacyExcerpt
            ? c("retainedAnswer")
            : t("modelPlayground.fullAnswer")
        }
      >
        <div className="grid min-w-0 gap-3">
          {column.legacyExcerpt ? (
            <p className="m-0 text-ui-caption">{c("legacyExcerpt")}</p>
          ) : null}
          {column.truncation.provider ? (
            <p className="m-0 text-ui-caption">{c("providerTruncated")}</p>
          ) : null}
          {column.truncation.application ? (
            <p className="m-0 text-ui-caption">{c("applicationTruncated")}</p>
          ) : null}
          {column.truncation.citations ? (
            <p className="m-0 text-ui-caption">{c("citationsTruncated")}</p>
          ) : null}
          <div className="model-playground-answer">
            <AiVisibilityAnswerText entities={highlights} text={column.answer ?? ""} />
          </div>
        </div>
      </Modal>
    </ModelPlaygroundColumnFrame>
  );
}
