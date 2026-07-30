import { AdminRefresh } from "@/components/admin/AdminRefresh";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { appRootPath } from "@/lib/routing/app-path";
import {
  ArrowRightIcon as ArrowRight,
  ChartLineUpIcon as ChartLineUp,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactNode } from "react";

export function AdminShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="sticky top-0 z-[80] border-b border-border bg-bg-elev/85 backdrop-blur-md">
        <div className="flex min-h-[60px] items-center justify-between gap-3 px-4 sm:px-[26px]">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-accent text-white">
              <ChartLineUp aria-hidden size={16} weight="bold" />
            </span>
            <span className="hidden text-base font-bold tracking-[-0.4px] sm:inline">
              bisibility
            </span>
            <span aria-hidden className="hidden h-4 w-px bg-border-strong md:block" />
            <span className="hidden font-mono text-[11px] uppercase tracking-[0.5px] text-fg-muted md:inline">
              Instance admin
            </span>
          </div>
          <div className="flex flex-none items-center gap-1 sm:gap-2">
            <AdminRefresh />
            <Link
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-[9px] px-2.5 text-[12.5px] font-semibold text-fg-muted transition-colors hover:bg-bg-sunken hover:text-fg sm:px-3"
              href={appRootPath()}
            >
              Back to app
              <ArrowRight aria-hidden size={12} weight="bold" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 px-4 pb-20 pt-7 sm:px-[26px] sm:pt-[30px]">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.7px]">Instance administration</h1>
          <p className="mt-1.5 text-[13px] text-fg-muted">
            Cross-instance operational diagnostics. Tenant data is represented by identifiers only.
          </p>
        </div>
        <AdminTabs />
        {children}
      </main>
    </div>
  );
}
