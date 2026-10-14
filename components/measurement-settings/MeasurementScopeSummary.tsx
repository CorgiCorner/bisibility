import type { MeasurementTranslator, ScopeEvidence } from "./contracts";

export function MeasurementScopeSummary({
  evidence,
  translate: t,
  formatDate,
}: {
  evidence: ScopeEvidence;
  translate: MeasurementTranslator;
  formatDate: (iso: string) => string;
}) {
  return (
    <section aria-label={t("scopeReview")}>
      <div className="grid gap-4 sm:grid-cols-2">
        {(
          [
            { key: "configured", scope: evidence.configured },
            { key: "effective", scope: evidence.effective },
          ] as const
        ).map(({ key, scope }) => (
          <section key={key}>
            <h3 className="text-sm font-semibold">{t(key)}</h3>
            {scope ? (
              <dl className="mt-2 flex flex-col gap-1 text-sm">
                <div>
                  <dt className="text-fg-muted">{t("fields.geo")}</dt>
                  <dd className="break-words">
                    {scope.geoLabel} ({t(`geoKinds.${scope.locationKind}`)})
                  </dd>
                </div>
                <div>
                  <dt className="text-fg-muted">{t("fields.language")}</dt>
                  <dd>{scope.languageCode}</dd>
                </div>
                <div>
                  <dt className="text-fg-muted">{t("fields.device")}</dt>
                  <dd>{t(`devices.${scope.device}`)}</dd>
                </div>
                <div>
                  <dt className="text-fg-muted">{t("fields.surface")}</dt>
                  <dd>{t(`surfaces.${scope.surface}`)}</dd>
                </div>
                <div>
                  <dt className="text-fg-muted">{t("fields.depth")}</dt>
                  <dd>{scope.depth}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-sm text-fg-muted">{t("effectiveUnknown")}</p>
            )}
          </section>
        ))}
      </div>
      <p className="mt-3 text-sm text-fg-muted">{t(`basis.${evidence.effectiveBasis}`)}</p>
      {evidence.effectiveBasis === "retained_observation" && evidence.observedAt ? (
        <p className="mt-2 text-sm text-fg-muted">
          {t("effectiveAt", { time: formatDate(evidence.observedAt) })}
        </p>
      ) : null}
      <p className="mt-3 text-sm text-fg-muted">{t(`degradation.${evidence.degradation}`)}</p>
      <dl className="mt-3 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
        {(["geo", "language", "device", "surface", "depth", "provider"] as const).map((field) => (
          <div key={field}>
            <dt className="inline text-fg-muted">{t(`fields.${field}`)}: </dt>
            <dd className="inline">{t(`sources.${evidence.sources[field]}`)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-sm text-fg-muted">{t("geoHelp")}</p>
    </section>
  );
}
