"use client";

import { Button } from "@/components/ui/Button";
import { HelpButton } from "@/components/ui/HelpButton";
import { Popup } from "@/components/ui/Popup";
import { Tooltip } from "@/components/ui/Tooltip";
import { resolveMeasurementHelp } from "@/lib/measurement-help/resolve";
import type { HelpCount, HelpTranslator } from "@/lib/measurement-help/types";
import { useId, useState } from "react";

export type MeasurementHelpProps = {
  metricId: string;
  definitionVersion: string;
  translate: HelpTranslator;
  /** Only explicit count fields survive the resolver; no raw provider text. */
  report?: unknown;
  contextState?: "ready" | "loading" | "error";
  formatCount: (value: number) => string;
};

export function MeasurementHelp({
  metricId,
  definitionVersion,
  translate: t,
  report,
  contextState = "ready",
  formatCount,
}: MeasurementHelpProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const id = useId();
  const help = resolveMeasurementHelp(metricId, definitionVersion, report);
  // Invalid IDs are an integration error; never label them as another metric.
  if (help.status !== "supported" && help.status !== "unsupported_version") return null;
  const { entry } = help;
  const supported = help.status === "supported";
  const title = t(entry.titleKey);
  const definition = t(
    help.status === "supported" ? help.entry.shortDefinitionKey : "neutralDefinition",
  );
  const popupId = `${id}-popup`;
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;

  return (
    <>
      <Tooltip
        content={definition}
        disabled={Boolean(anchor)}
        semantics="description"
        placement="top"
      >
        <HelpButton
          aria-label={t("explain", { title })}
          aria-haspopup="dialog"
          aria-expanded={Boolean(anchor)}
          aria-controls={anchor ? popupId : undefined}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") event.stopPropagation();
          }}
          onKeyUp={(event) => {
            if (event.key === "Enter" || event.key === " ") event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            setAnchor(event.currentTarget);
          }}
        />
      </Tooltip>
      <Popup
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        restoreFocus
        id={popupId}
        contentProps={{
          "aria-labelledby": titleId,
          "aria-describedby": descriptionId,
          className: "w-80 max-w-[calc(100vw-32px)] p-4 text-sm text-fg",
          onPointerDown: (event) => event.stopPropagation(),
          onClick: (event) => event.stopPropagation(),
          onKeyDown: (event) => {
            if (event.key === "Enter" || event.key === " ") event.stopPropagation();
          },
          onKeyUp: (event) => {
            if (event.key === "Enter" || event.key === " ") event.stopPropagation();
          },
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="font-semibold">
            {title}
          </h2>
          <Button variant="ghost" className="shrink-0" onClick={() => setAnchor(null)}>
            {t("close")}
          </Button>
        </div>
        <p id={descriptionId} className="mt-2">
          {definition}
        </p>
        {help.status === "supported" ? (
          <>
            <p className="mt-3">{t(help.entry.interpretationKey)}</p>
            <p className="mt-3 text-fg-muted">{t(help.entry.limitationKey)}</p>
          </>
        ) : (
          <p className="mt-3 text-fg-muted">{t("unknownVersion")}</p>
        )}
        {supported && contextState === "ready" && Object.keys(help.context).length > 0 ? (
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
            {Object.entries(help.context).map(([key, value]) => (
              <div key={key} className="contents">
                <dt>{t(`counts.${key as HelpCount}`)}</dt>
                <dd>{value === null ? t("unknownValue") : formatCount(value)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {supported && contextState !== "ready" ? (
          <p role="status" className="mt-3 text-fg-muted">
            {t(contextState === "loading" ? "contextLoading" : "contextError")}
          </p>
        ) : null}
        <a
          href={`/guides/rank-measurements${supported ? entry.glossaryAnchor : ""}`}
          className="mt-3 inline-block text-fg underline underline-offset-4"
        >
          {t("glossary", { title })}
        </a>
      </Popup>
    </>
  );
}
