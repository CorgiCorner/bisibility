import type { MeasurementCapability } from "@/lib/measurement-settings/capabilities";
import type { MeasurementTranslator } from "./contracts";
/** Describes implemented evidence, never promises complete results from the requested depth. */
export function MeasurementCapabilityEvidence({
  capability,
  translate: t,
}: Readonly<{
  capability: MeasurementCapability;
  translate: MeasurementTranslator;
}>) {
  return (
    <details className="mt-3 text-sm text-fg-muted">
      <summary className="cursor-pointer">{t("capabilityEvidence.title")}</summary>
      <ul className="mt-2 space-y-1">
        <li>{t(`capabilityEvidence.${capability.evidence.stableIds}`)}</li>
        <li>{t(`capabilityEvidence.${capability.evidence.positions}`)}</li>
        <li>{t("capabilityEvidence.coverage")}</li>
        <li>{t("capabilityEvidence.pagination")}</li>
        <li>{t("capabilityEvidence.freshness")}</li>
      </ul>
    </details>
  );
}

export function MeasurementSelectionEvidence({
  choices,
  selection,
  translate,
}: Readonly<{
  choices: import("./contracts").MeasurementChoices;
  selection: import("./contracts").MeasurementSelection;
  translate: MeasurementTranslator;
}>) {
  const capability = choices.providers
    .find((row) => row.providerId === selection.providerId)
    ?.capabilities.find(
      (row) =>
        row.surface === selection.surface && row.capabilityVersion === selection.capabilityVersion,
    );
  return capability ? (
    <MeasurementCapabilityEvidence capability={capability} translate={translate} />
  ) : null;
}
