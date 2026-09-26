"use client";

import { appRootPath } from "@/lib/routing/app-path";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

function isActiveTab(pathname: string, href: string) {
  if (href === appRootPath("admin")) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminTabs({
  extraTabs = [],
}: {
  extraTabs?: readonly { href: string; label: string }[];
}) {
  const pathname = usePathname() ?? appRootPath("admin");
  const t = useTranslations("instanceAdmin.navigation");
  const tabs = [
    { href: appRootPath("admin"), label: t("operations") },
    { href: appRootPath("admin", "administration"), label: t("administration") },
    { href: appRootPath("admin", "audit"), label: t("audit") },
    { href: appRootPath("admin", "metering"), label: t("metering") },
    ...extraTabs,
  ] as const;

  return (
    <nav
      aria-label={t("label")}
      className="flex items-center gap-0.5 overflow-x-auto border-b border-border"
    >
      {tabs.map((tab) => {
        const active = isActiveTab(pathname, tab.href);
        const className = [
          "-mb-px shrink-0 border-b-2 px-4 py-2.5 text-[13px] font-semibold transition-colors",
          active ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg",
        ].join(" ");

        if (active) {
          return (
            <span aria-current="page" className={className} key={tab.href}>
              {tab.label}
            </span>
          );
        }

        return (
          <Link className={className} href={tab.href} key={tab.href}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
