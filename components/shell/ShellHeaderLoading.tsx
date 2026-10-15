"use client";

import { usePathname } from "next/navigation";
import { headerMetaFor } from "./header-title";

function Block({ className }: Readonly<{ className?: string }>) {
  return (
    <div className={`motion-safe:animate-pulse rounded-control bg-bg-sunken ${className ?? ""}`} />
  );
}

/** Route shape is known before project data; Dashboard and Rank Tracker have no subtitle. */
export function ShellHeaderLoading() {
  const pathname = usePathname() ?? "/app";
  const meta = headerMetaFor(pathname);
  return (
    <div
      className="relative z-40 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center justify-between gap-2.5 border-b border-border bg-bg-sidebar px-4 py-3 sm:flex sm:flex-nowrap sm:gap-4 sm:px-5 lg:px-7 lg:py-3.5"
      data-testid="shell-skeleton-header"
    >
      <div className="contents sm:flex sm:min-w-0 sm:flex-1 sm:items-center sm:gap-3 sm:overflow-hidden">
        <Block className="size-9 flex-none lg:hidden" />
        <div className="col-span-3 col-start-1 row-start-2 min-w-0 overflow-hidden">
          <Block
            className={`h-[1lh] w-[180px] max-w-full leading-tight ${meta.headerVariant === "settings" ? "text-[21px]" : "text-lg sm:text-[21px]"}`}
          />
          {meta.subtitle ? (
            <Block className="mt-1 hidden h-[1lh] w-[260px] max-w-full text-[12.5px] sm:block" />
          ) : null}
        </div>
      </div>
      <div className="col-start-3 row-start-1 flex flex-none items-center gap-2.5">
        <Block className="h-8 w-8" />
        <Block className="size-8 lg:hidden" />
        <Block className="h-8 w-8" />
        <Block className="h-8 w-8" />
      </div>
    </div>
  );
}
