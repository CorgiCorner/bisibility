import { Tooltip } from "@/components/ui/Tooltip";
import { useTranslations } from "next-intl";

export function ResearchUnavailableMetric({
  label,
  className = "font-sans tabular-nums text-fg-muted",
}: Readonly<{ className?: string; label: string }>) {
  const t = useTranslations("projectResearch.unavailable");
  return (
    <Tooltip content={t("tooltip")}>
      <span aria-label={label} className={`${className} cursor-help`}>
        {t("value")}
      </span>
    </Tooltip>
  );
}
