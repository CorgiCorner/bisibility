import { ZonedTime } from "@/components/ui/ZonedTime";
import type { IntegrationProviderData } from "@/lib/integrations/types";
import { useTranslations } from "next-intl";

type ProviderSyncFailure = NonNullable<IntegrationProviderData["syncFailure"]>;

function failureClass(value: string, t: ReturnType<typeof useTranslations>) {
  return value === "unknown" ? t("failureUnknown") : value.replaceAll("_", " ");
}

export function ProviderSyncFailureAlert({
  failure,
  managementActionLabel = "Manage",
  timeZone,
}: Readonly<{
  failure: ProviderSyncFailure;
  managementActionLabel?: string;
  timeZone: string;
}>) {
  const t = useTranslations("projectIntegrations.provider");
  const since = new Date(failure.since);
  return (
    <p
      className="m-0 mt-3 rounded-control border border-red bg-red/5 px-3 py-2 text-[12.5px] leading-[1.45] text-red-text"
      role="alert"
    >
      <strong className="font-semibold">{t("trafficFailureTitle")}</strong>{" "}
      {failure.errorClass === "config_invalid"
        ? `${t("trafficFailureConfig", { action: managementActionLabel })} `
        : null}
      {t("failingSince", {
        value: Number.isNaN(since.getTime()) ? t("unknownTime") : "",
      })}{" "}
      {Number.isNaN(since.getTime()) ? null : (
        <ZonedTime timeZone={timeZone} value={failure.since} />
      )}{" "}
      · {t("consecutiveFailures", { count: failure.consecutiveFailures })} ·{" "}
      {failureClass(failure.errorClass, t)}.
    </p>
  );
}
