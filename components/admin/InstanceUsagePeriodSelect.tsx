"use client";
import { MenuSelect } from "@/components/ui/MenuSelect";
import type { InstanceUsagePeriod } from "@/lib/queries/instance-usage-report";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

export function InstanceUsagePeriodSelect({ period }: { period: InstanceUsagePeriod }) {
  const t = useTranslations("instanceAdmin.instanceUsage");
  const router = useRouter(),
    pathname = usePathname(),
    search = useSearchParams();
  return (
    <MenuSelect
      ariaLabel={t("period")}
      size="toolbar"
      value={period}
      options={[
        { value: "all", label: t("all") },
        { value: "month", label: t("month") },
      ]}
      onChange={(value) => {
        const params = new URLSearchParams(search.toString());
        params.set("usagePeriod", value);
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      }}
    />
  );
}
