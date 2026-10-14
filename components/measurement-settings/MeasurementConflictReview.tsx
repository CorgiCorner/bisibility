import type { MeasurementChoices, MeasurementTranslator, SettingsSnapshot } from "./contracts";
import type { MeasurementDraft } from "./draft";

export function MeasurementConflictReview({
  current,
  draft,
  choices,
  translate: t,
}: {
  current: SettingsSnapshot;
  draft: MeasurementDraft;
  choices: MeasurementChoices;
  translate: MeasurementTranslator;
}) {
  return (
    <div className="mt-3 grid gap-4 sm:grid-cols-2">
      {(
        [
          { label: "current", value: current },
          { label: "yourDraft", value: draft },
        ] as const
      ).map(({ label, value }) => (
        <section key={label}>
          <h3 className="text-sm font-semibold">{t(label)}</h3>
          <dl className="mt-2 flex flex-col gap-1 text-sm">
            <div>
              <dt className="text-fg-muted">{t("fields.provider")}</dt>
              <dd>
                {choices.providers.find((row) => row.providerId === value.selection.providerId)
                  ?.label ?? t("unavailable")}
              </dd>
            </div>
            <div>
              <dt className="text-fg-muted">{t("fields.geo")}</dt>
              <dd>
                {choices.geographies.find((row) => row.id === value.selection.geoId)?.label ??
                  t("unavailable")}
              </dd>
            </div>
            <div>
              <dt className="text-fg-muted">{t("fields.language")}</dt>
              <dd>{value.selection.languageCode}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">{t("fields.device")}</dt>
              <dd>{t(`devices.${value.selection.device}`)}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">{t("fields.surface")}</dt>
              <dd>{t(`surfaces.${value.selection.surface}`)}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">{t("fields.depth")}</dt>
              <dd>{value.selection.depth}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">{t("fields.frequency")}</dt>
              <dd>
                {value.schedule
                  ? `${t(`cadences.${value.schedule.frequency}`)}, ${value.schedule.timezone}, ${t(value.schedule.enabled ? "enabled" : "paused")}`
                  : t("manualOnly")}
              </dd>
            </div>
          </dl>
        </section>
      ))}
    </div>
  );
}
