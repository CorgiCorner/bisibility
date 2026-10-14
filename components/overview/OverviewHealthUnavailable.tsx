import { Card } from "@/components/ui/Card";
import { useTranslations } from "next-intl";

/** Missing health is never a healthy count or permission to launch checks. */
export function OverviewHealthUnavailable() {
  const t = useTranslations("shared.dashboardLayout");
  return (
    <Card>
      <p role="status" className="text-sm text-fg-muted">
        {t("healthUnknown")}
      </p>
      <p className="mt-2 text-sm text-fg-muted">{t("budgetUnknown")}</p>
    </Card>
  );
}
