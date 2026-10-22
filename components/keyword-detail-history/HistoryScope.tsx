"use client";

import type { RankReportObservation } from "@/lib/rank-reports/records";
import { useLocale, useTranslations } from "next-intl";
import { HistoryResultKind } from "./HistoryResultKind";

type Scope = RankReportObservation["configuredScope"];
const scopeFields = [
  "engine",
  "surface",
  "resultKind",
  "rankScale",
  "location",
  "language",
  "device",
  "targetRevision",
  "policyRevision",
  "identityRevision",
] as const;
export function sameHistoryScope(first: Scope, second: Scope) {
  return (
    first === second ||
    Boolean(first && second && scopeFields.every((key) => first[key] === second[key]))
  );
}
function displayName(locale: string, type: "language" | "region", value: string) {
  try {
    return new Intl.DisplayNames([locale], { type }).of(value) ?? value;
  } catch {
    return value;
  }
}

export function HistoryScope({ scope }: Readonly<{ scope: Scope }>) {
  const locale = useLocale();
  const t = useTranslations("projectRankTracker.keywordDetail.recordedHistory");
  if (!scope) return <span>{t("unknownScope")}</span>;
  const country = /^country:([a-z]{2})(?:@.*)?$/i.exec(scope.location);
  const location = country
    ? displayName(locale, "region", country[1].toUpperCase())
    : scope.location;
  const device =
    scope.device === "mobile" || scope.device === "desktop"
      ? t(`scopeDevices.${scope.device}`)
      : scope.device;
  const engine =
    scope.engine === "google" ? "Google" : scope.engine === "bing" ? "Bing" : scope.engine;
  return (
    <div className="min-w-0 text-[11px] text-fg-muted">
      <span>
        {[engine, location, displayName(locale, "language", scope.language), device].join(" · ")}
      </span>
      <details className="mt-1">
        <summary className="cursor-pointer text-fg-muted">{t("scopeTechnicalDetails")}</summary>
        <div className="mt-1 break-words">
          {scope.surface} · <HistoryResultKind kind={scope.resultKind} /> · {scope.rankScale}
          <span className="block break-all">
            {t("revision", { value: scope.targetRevision ?? t("unknown") })}
          </span>
        </div>
      </details>
    </div>
  );
}
