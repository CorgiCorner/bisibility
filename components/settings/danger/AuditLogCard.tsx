"use client";

import { appPath } from "@/lib/routing/app-path";
import { ArrowRightIcon as ArrowRight, ScrollIcon as Scroll } from "@phosphor-icons/react";
import Link from "next/link";

export function AuditLogCard({ projectRef }: Readonly<{ projectRef: string }>) {
  return (
    <section>
      <Link
        className="flex items-center gap-3.5 rounded-[14px] border border-border bg-bg-elev px-5 py-[18px] outline-none transition-colors hover:border-accent focus-visible:border-accent"
        href={appPath(projectRef, "settings", "audit")}
      >
        <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[11px] bg-bg-sunken text-fg">
          <Scroll aria-hidden size={22} weight="fill" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[14.5px] font-semibold text-fg">Audit log</span>
            <span className="rounded-full border border-border bg-bg-sunken px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.4px] text-fg-muted">
              Admin
            </span>
          </span>
          <span className="mt-[3px] block text-[12.5px] leading-[1.45] text-fg-muted">
            Immutable record of every account, permission, data and system change. Filter, inspect
            diffs and export for compliance.
          </span>
        </span>
        <span className="hidden min-h-9 shrink-0 items-center gap-1.5 rounded-[9px] border border-border-strong bg-bg-elev px-3 text-[12.5px] font-semibold text-fg-muted sm:inline-flex">
          Open audit log
          <ArrowRight aria-hidden size={13} weight="bold" />
        </span>
        <ArrowRight
          aria-hidden
          className="shrink-0 text-fg-muted sm:hidden"
          size={16}
          weight="bold"
        />
      </Link>
    </section>
  );
}
