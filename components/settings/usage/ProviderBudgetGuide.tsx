"use client";

import { useTranslations } from "next-intl";

export function ProviderBudgetGuide() {
  const t = useTranslations("projectSettingsUsage.provider");
  return (
    <div className="my-4 grid gap-3 sm:grid-cols-2">
      <div className="rounded-control border border-border p-3">
        <h3 className="m-0 text-[13px] font-medium text-fg">{t("surface.app")}</h3>
        <p className="m-0 mt-1 text-[12px] leading-5 text-fg-muted">{t("appBudgetHelp")}</p>
      </div>
      <div className="rounded-control border border-border p-3">
        <h3 className="m-0 text-[13px] font-medium text-fg">{t("surface.programmatic")}</h3>
        <p className="m-0 mt-1 text-[12px] leading-5 text-fg-muted">{t("apiBudgetHelp")}</p>
      </div>
    </div>
  );
}
