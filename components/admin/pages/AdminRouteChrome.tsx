import { AdminScrollNav } from "@/components/admin/pages/AdminScrollNav";
import { BrandLockup } from "@/components/ui/BrandLockup";
import type { AdminRoute } from "@/lib/instance-admin/routes";
import Link from "next/link";
import type { ReactNode } from "react";
import { AdminNavLabel } from "./AdminNavLabel";
import { AdminRouteRefresh } from "./AdminRouteRefresh";
export type AdminChromeLabels = {
  context: string;
  back: string;
  title: string;
  description: string;
  navigation: string;
  views: string;
  question: string;
  tabs: Record<string, string>;
  subtabs: Record<string, string>;
};
/** Server-rendered chrome, also rendered by fixture stories for geometry checks. */
export function AdminRouteChrome({
  loading = false,
  active,
  tabs,
  subtabs,
  labels,
  children,
}: {
  loading?: boolean;
  active: AdminRoute;
  tabs: AdminRoute[];
  subtabs: AdminRoute[];
  labels: AdminChromeLabels;
  children: ReactNode;
}) {
  const linkClass = (selected: boolean, subtab = false) =>
    `shrink-0 border-b-2 px-3 ${subtab ? "py-2 font-medium" : "-mb-px py-2.5 text-[13px] font-semibold transition-colors sm:px-4"} ${selected ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg"}`;
  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="border-b border-border bg-bg-elev px-4 sm:px-[26px]">
        <div className="flex min-h-[60px] items-center gap-2.5">
          <BrandLockup className="sm:hidden" markOnly />
          <BrandLockup className="hidden sm:inline-flex" />
          <span className="hidden text-[11px] uppercase tracking-[0.5px] text-fg-muted md:inline">
            {labels.context}
          </span>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <AdminRouteRefresh loading={loading} />
            <Link
              className="shrink-0 text-xs font-semibold text-fg-muted hover:text-fg"
              href="/app"
            >
              {labels.back}
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto grid min-w-0 w-full max-w-[1180px] grid-cols-1 gap-4 px-4 pt-7 pb-20 sm:px-[26px] sm:pt-[30px]">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.7px]">{labels.title}</h1>
          <p className="mt-1.5 text-[13px] text-fg-muted">{labels.description}</p>
        </div>
        <AdminScrollNav label={labels.navigation} activeKey={active.tab}>
          {tabs.map((route) => (
            <Link
              key={route.tab}
              href={route.href}
              aria-current={active.tab === route.tab ? "page" : undefined}
              className={linkClass(active.tab === route.tab)}
            >
              <AdminNavLabel>{labels.tabs[route.tab]}</AdminNavLabel>
            </Link>
          ))}
        </AdminScrollNav>
        {subtabs.length > 1 && (
          <AdminScrollNav label={labels.views} activeKey={active.href}>
            {subtabs.map((route) => (
              <Link
                key={route.href}
                href={route.href}
                aria-current={route.href === active.href ? "page" : undefined}
                className={linkClass(route.href === active.href, true)}
              >
                <AdminNavLabel>{labels.subtabs[route.view]}</AdminNavLabel>
              </Link>
            ))}
          </AdminScrollNav>
        )}
        <div className="grid min-w-0 gap-4">
          <h2 className="text-base font-semibold">{labels.question}</h2>
          {children}
        </div>
      </main>
    </div>
  );
}
