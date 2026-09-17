"use client";

import { useTranslations } from "next-intl";

export function AdminSectionUnavailable({ children }: Readonly<{ children: string }>) {
  const t = useTranslations("instanceAdmin.values");
  return (
    <p className="rounded-card bg-yellow/10 p-3 text-xs text-yellow-text">
      {t("sectionUnavailable", { message: children })}
    </p>
  );
}
