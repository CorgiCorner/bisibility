import type { BusinessTranslator, MatchSummary } from "./contracts";

export function BusinessMatchProvenance({
  decision,
  translate: t,
  formatDate,
}: {
  decision: MatchSummary;
  translate: BusinessTranslator;
  formatDate: (value: string) => string;
}) {
  return (
    <>
      <dt>{t("decisionSource")}</dt>
      <dd className="min-w-0 break-words">{t(`decisionSources.${decision.source}`)}</dd>
      <dt>{t("decisionRecordedAt")}</dt>
      <dd className="min-w-0 break-words">{formatDate(decision.recordedAt)}</dd>
      <dt>{t("matcherVersion")}</dt>
      <dd className="min-w-0 break-words">{decision.matcherVersion}</dd>
      {decision.surface === "maps" ? (
        <>
          <dt>{t("sourceGroup")}</dt>
          <dd className="min-w-0 break-words">
            {decision.originalOrdinals.group ?? t("notProvided")}
          </dd>
        </>
      ) : null}
      <dt>{t("sourceScale")}</dt>
      <dd className="min-w-0 break-words">{decision.rankScale ?? t("notProvided")}</dd>
    </>
  );
}
