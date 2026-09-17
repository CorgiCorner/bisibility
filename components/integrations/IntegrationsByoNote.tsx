import { FirstCheckBanner } from "@/components/rank-check/FirstCheckBanner";
import { useTranslations } from "next-intl";

export function IntegrationsByoNote() {
  const t = useTranslations("projectIntegrations.byo");
  return <FirstCheckBanner detail={t("detail")} title={t("title")} />;
}
