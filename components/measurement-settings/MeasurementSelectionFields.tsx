import { MenuSelect } from "@/components/ui/MenuSelect";
import type { MeasurementChoices, MeasurementSelection, MeasurementTranslator } from "./contracts";

function readableCurrent(
  value: string,
  options: readonly { value: string; label: string; disabled?: boolean }[],
  unknown: string,
) {
  return options.some((option) => option.value === value)
    ? options
    : [{ value, label: `${unknown}: ${value}`, disabled: true }, ...options];
}
export function MeasurementSelectionFields({
  selection,
  choices,
  disabled,
  translate: t,
  onChange,
  errorId,
  errorField,
}: {
  selection: MeasurementSelection;
  choices: MeasurementChoices;
  disabled: boolean;
  translate: MeasurementTranslator;
  onChange: (selection: MeasurementSelection) => void;
  errorId?: string;
  errorField?: string;
}) {
  const provider = choices.providers.find((row) => row.providerId === selection.providerId);
  const capabilities =
    provider?.capabilities.filter(
      (row) => row.providerId === selection.providerId && row.engine === "google",
    ) ?? [];
  const sameSurface = capabilities.filter((row) => row.surface === selection.surface);
  const capability = sameSurface.length === 1 ? sameSurface[0] : null;
  const change = (patch: Partial<MeasurementSelection>) => onChange({ ...selection, ...patch });
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <MenuSelect
        ariaLabel={t("fields.provider")}
        leadingLabel={t("fields.provider")}
        ariaInvalid={errorField === "provider"}
        ariaDescribedBy={errorField === "provider" ? errorId : undefined}
        disabled={disabled}
        value={selection.providerId}
        options={readableCurrent(
          selection.providerId,
          choices.providers.map((row) => ({
            value: row.providerId,
            label: row.label,
            disabled: row.connection !== "connected",
          })),
          t("unavailable"),
        )}
        onChange={(providerId) => {
          const next = choices.providers.find((row) => row.providerId === providerId);
          const matches =
            next?.capabilities.filter(
              (row) =>
                row.surface === selection.surface &&
                row.providerId === providerId &&
                row.engine === "google",
            ) ?? [];
          change({
            providerId,
            capabilityVersion:
              matches.length === 1 ? matches[0].capabilityVersion : selection.capabilityVersion,
          });
        }}
      />
      <MenuSelect
        ariaLabel={t("fields.surface")}
        leadingLabel={t("fields.surface")}
        ariaInvalid={errorField === "surface"}
        ariaDescribedBy={errorField === "surface" ? errorId : undefined}
        disabled={disabled}
        value={selection.surface}
        options={(["web_serp", "maps", "local_finder"] as const).map((surface) => ({
          value: surface,
          label: t(`surfaces.${surface}`),
          disabled: capabilities.filter((row) => row.surface === surface).length !== 1,
        }))}
        onChange={(surface) => {
          const next = capabilities.filter((row) => row.surface === surface);
          if (next.length === 1)
            change({ surface: next[0].surface, capabilityVersion: next[0].capabilityVersion });
        }}
      />
      <MenuSelect
        ariaLabel={t("fields.geo")}
        leadingLabel={t("fields.geo")}
        ariaInvalid={errorField === "geo"}
        ariaDescribedBy={errorField === "geo" ? errorId : undefined}
        disabled={disabled}
        value={selection.geoId}
        options={readableCurrent(
          selection.geoId,
          choices.geographies
            .filter(
              (row) =>
                row.providerIds.includes(selection.providerId) &&
                capability?.locationKinds.includes(row.kind) &&
                (row.kind !== "point" || capability.coordinates),
            )
            .map((row) => ({
              value: row.id,
              label: `${row.label} (${t(`geoKinds.${row.kind}`)})`,
            })),
          t("unavailable"),
        )}
        onChange={(geoId) => {
          const geo = choices.geographies.find((row) => row.id === geoId);
          change({
            geoId,
            ...(geo?.languageCodes?.length === 1 ? { languageCode: geo.languageCodes[0] } : {}),
          });
        }}
      />
      <MenuSelect
        ariaLabel={t("fields.language")}
        leadingLabel={t("fields.language")}
        ariaInvalid={errorField === "language"}
        ariaDescribedBy={errorField === "language" ? errorId : undefined}
        disabled={disabled}
        value={selection.languageCode}
        options={readableCurrent(
          selection.languageCode,
          choices.languages
            .filter(
              (row) =>
                row.providerIds.includes(selection.providerId) &&
                (!choices.geographies.find((geo) => geo.id === selection.geoId)?.languageCodes ||
                  choices.geographies
                    .find((geo) => geo.id === selection.geoId)!
                    .languageCodes!.includes(row.code)),
            )
            .map((row) => ({ value: row.code, label: row.label })),
          t("unavailable"),
        )}
        onChange={(languageCode) => change({ languageCode })}
      />
      <MenuSelect
        ariaLabel={t("fields.device")}
        leadingLabel={t("fields.device")}
        ariaInvalid={errorField === "device"}
        ariaDescribedBy={errorField === "device" ? errorId : undefined}
        disabled={disabled}
        value={selection.device}
        options={(["desktop", "mobile"] as const).map((device) => ({
          value: device,
          label: t(`devices.${device}`),
          disabled: !capability?.devices.includes(device),
        }))}
        onChange={(device) => {
          if (device === "desktop" || device === "mobile") change({ device });
        }}
      />
      <MenuSelect
        ariaLabel={t("fields.depth")}
        leadingLabel={t("fields.depth")}
        ariaInvalid={errorField === "depth"}
        ariaDescribedBy={errorField === "depth" ? errorId : undefined}
        disabled={disabled}
        value={String(selection.depth)}
        options={readableCurrent(
          String(selection.depth),
          capability?.depths
            .filter((depth) => depth <= capability.maxDepth)
            .map((depth) => ({ value: String(depth), label: String(depth) })) ?? [],
          t("unavailable"),
        )}
        onChange={(depth) => {
          const value = Number(depth);
          if (capability?.depths.includes(value)) change({ depth: value });
        }}
      />
    </div>
  );
}
