"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

export function AdminMeteringFrame({
  incidents = false,
  children,
}: {
  incidents?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("instanceAdmin");
  return (
    <div className="grid min-w-0 grid-cols-1 gap-5">
      <div>
        <h1 className="text-base font-semibold">{t("metering.heading")}</h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-fg-muted">
          {t("metering.description")}
        </p>
      </div>
      <nav
        className="flex gap-1 overflow-x-auto border-b border-border text-[13px]"
        aria-label={t("metering.heading")}
      >
        {[
          { href: "/app/admin/metering", label: t("recovery.usageTab"), active: !incidents },
          {
            href: "/app/admin/metering/recovery",
            label: t("recovery.openIncidents"),
            active: incidents,
          },
        ].map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.active ? "page" : undefined}
            className={`shrink-0 border-b-2 px-3 py-2 font-medium ${tab.active ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg"}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
