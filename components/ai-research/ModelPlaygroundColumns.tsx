"use client";

import { PaymentChargeLine } from "@/components/action-payment/PaymentChargeLine";
import { AiVisibilityAnswerText } from "@/components/ai-tracking/AiVisibilityAnswerText";
import { sourceTypeLabel } from "@/components/ai-tracking/source-copy";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { Modal } from "@/components/ui/Modal";
import { StatusChip } from "@/components/ui/StatusChip";
import { Tooltip } from "@/components/ui/Tooltip";
import type { ActionPaymentReceipt } from "@/lib/action-payment/contract";
import {
  type PlaygroundColumn,
  type PlaygroundEntity,
  type PlaygroundSourceOverride,
  type PlaygroundVerdict,
  playgroundCitedDomains,
  playgroundMentions,
  playgroundVerdict,
} from "@/lib/ai-research/model-playground-view";
import { XIcon as X } from "@phosphor-icons/react/dist/csr/X";
import { useTranslations } from "next-intl";
import { useState } from "react";

type ClassContext = {
  competitorDomains: readonly string[];
  excludedNames: readonly string[];
  overrides: readonly PlaygroundSourceOverride[];
  ownDomain: string | null;
};

export function ModelPlaygroundColumns({
  columns,
  entities,
  funding,
  onRemove,
  payment,
  running,
  sourceContext,
}: Readonly<{
  columns: readonly PlaygroundColumn[];
  entities: readonly PlaygroundEntity[];
  funding: "byok" | "platform" | null;
  onRemove: (id: string) => void;
  payment?: ActionPaymentReceipt;
  running: boolean;
  sourceContext: ClassContext;
}>) {
  const t = useTranslations("projectAiResearch");
  const tracking = useTranslations("projectAiTracking");
  const highlight = entities.map((entity) => ({
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
  return (
    <div className="min-w-0 overflow-x-auto">
      <div className="flex w-max gap-4">
        {columns.map((column) => (
          <Card className="grid w-96 shrink-0 content-start gap-3" key={column.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="m-0 text-ui-body font-medium">{column.label}</p>
                {column.model ? (
                  <p className="m-0 text-ui-caption text-fg-muted">{column.model}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-1">
                {funding ? (
                  <Tooltip content={t("modelPlayground.sharedPayment")}>
                    <span>
                      <StatusChip
                        dot={false}
                        label={t(
                          funding === "byok"
                            ? "modelPlayground.yourKey"
                            : "modelPlayground.credits",
                        )}
                        tone={funding === "byok" ? "info" : "positive"}
                      />
                    </span>
                  </Tooltip>
                ) : null}
                <IconButton
                  aria-label={t("modelPlayground.remove")}
                  onClick={() => onRemove(column.id)}
                  size="small"
                  type="button"
                >
                  <X size={16} weight="regular" />
                </IconButton>
              </div>
            </div>
            {running ? (
              <div className="grid gap-2" role="status">
                <span className="h-4 animate-pulse rounded-control bg-bg-sunken" />
                <span className="h-16 animate-pulse rounded-control bg-bg-sunken" />
              </div>
            ) : column.failed || column.answer === null ? (
              <p className="m-0 text-ui-body text-red-text" role="alert">
                {t("partialFailure")}
              </p>
            ) : (
              <AnswerBody
                answer={column.answer}
                citations={column.citations}
                entities={entities}
                highlight={highlight}
                observedAt={column.observedAt}
                payment={payment}
                sourceContext={sourceContext}
                tracking={tracking}
                verdict={playgroundVerdict(column.answer, column.citations, entities)}
              />
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function AnswerBody({
  answer,
  citations,
  entities,
  highlight,
  observedAt,
  payment,
  sourceContext,
  tracking,
  verdict,
}: Readonly<{
  answer: string;
  citations: PlaygroundColumn["citations"];
  entities: readonly PlaygroundEntity[];
  highlight: Parameters<typeof AiVisibilityAnswerText>[0]["entities"];
  observedAt: string | null;
  payment?: ActionPaymentReceipt;
  sourceContext: ClassContext;
  tracking: ReturnType<typeof useTranslations<"projectAiTracking">>;
  verdict: PlaygroundVerdict;
}>) {
  const t = useTranslations("projectAiResearch");
  const [open, setOpen] = useState(false);
  const mentions = playgroundMentions(answer, citations, entities);
  const sources = playgroundCitedDomains([{ citations, label: "" }], sourceContext);
  const verdictText =
    verdict.kind === "named_cited"
      ? t("modelPlayground.verdictNamedCited", { position: verdict.position ?? 0 })
      : verdict.kind === "named"
        ? t("modelPlayground.verdictNamed", { position: verdict.position ?? 0 })
        : t(
            verdict.kind === "cited"
              ? "modelPlayground.verdictCited"
              : "modelPlayground.verdictAbsent",
          );
  return (
    <>
      <p className="m-0 text-ui-body font-medium">{verdictText}</p>
      <div className="max-h-36 overflow-hidden">
        <AiVisibilityAnswerText entities={highlight} text={answer} />
      </div>
      <div className="grid gap-1">
        <p className="m-0 text-ui-caption font-medium">{t("modelPlayground.brandsHeading")}</p>
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
          <p className="m-0 text-ui-caption text-fg-muted">{t("modelPlayground.verdictAbsent")}</p>
        )}
      </div>
      <div className="grid gap-2">
        <p className="m-0 text-ui-caption font-medium">{t("modelPlayground.sourcesHeading")}</p>
        {sources.map((source) => (
          <div className="flex flex-wrap items-center gap-2" key={source.domain}>
            <span className="text-ui-body">{source.domain}</span>
            <span className="text-ui-caption tabular-nums text-fg-muted">
              {t("modelPlayground.citedTimes", { count: source.count })}
            </span>
            <StatusChip dot={false} label={sourceTypeLabel(source.type, tracking)} tone="neutral" />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-ui-caption text-fg-muted">
        {observedAt ? <span className="tabular-nums">{observedAt.slice(0, 16)}</span> : null}
        <span>
          {t("modelPlayground.runCost")} <PaymentChargeLine payment={payment} />
        </span>
        <Button onClick={() => setOpen(true)} type="button" variant="ghost">
          {t("modelPlayground.fullAnswer")}
        </Button>
      </div>
      <Modal onClose={() => setOpen(false)} open={open} title={t("modelPlayground.fullAnswer")}>
        <AiVisibilityAnswerText entities={highlight} text={answer} />
      </Modal>
    </>
  );
}
