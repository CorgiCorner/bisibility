"use client";

import { appRootPath } from "@/lib/routing/app-path";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

function isActiveTab(pathname: string, href: string) {
  if (href === appRootPath("admin")) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminTabs({
  extraTabs = [],
}: {
  extraTabs?: readonly { href: string; label: string; section?: string }[];
}) {
  const pathname = usePathname() ?? appRootPath("admin");
  const usagePeriod = useSearchParams().get("usagePeriod");
  const t = useTranslations("instanceAdmin.navigation");
  const tabs = [
    { href: appRootPath("admin"), label: t("operations") },
    { href: appRootPath("admin", "administration"), label: t("administration") },
    { href: appRootPath("admin", "audit"), label: t("audit") },
    { href: appRootPath("admin", "metering"), label: t("metering") },
  ];
  const groups = [{ label: t("instance"), tabs }];
  for (const tab of extraTabs) {
    if (!tab.section) {
      tabs.push(tab);
      continue;
    }
    const group = groups.find((group) => group.label === tab.section);
    if (group) group.tabs.push(tab);
    else groups.push({ label: tab.section, tabs: [tab] });
  }
  const grouped = groups.length > 1;

  return (
    <nav
      aria-label={t("label")}
      className={grouped ? "flex min-w-0 flex-col gap-3" : "flex min-w-0 border-b border-border"}
    >
      {groups.map((group) => (
        <div key={group.label} className="min-w-0 flex-1" data-admin-navigation-group={group.label}>
          {grouped ? (
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
              {group.label}
            </p>
          ) : null}
          <div
            className={`flex items-center gap-0.5 overflow-x-auto ${grouped ? "border-b border-border" : ""}`}
          >
            {group.tabs.map((tab) => {
              const href =
                usagePeriod === "month" &&
                [appRootPath("admin"), appRootPath("admin", "administration")].includes(tab.href)
                  ? `${tab.href}?usagePeriod=month`
                  : tab.href;
              const active = isActiveTab(pathname, tab.href);
              const className = [
                "-mb-px shrink-0 border-b-2 px-3 py-2.5 text-[13px] sm:px-4 font-semibold transition-colors",
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
                <Link className={className} href={href} key={tab.href}>
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
