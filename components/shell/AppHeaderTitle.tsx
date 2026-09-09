"use client";

import { headerMetaFor } from "@/components/shell/header-title";
import { IdChip } from "@/components/ui/IdChip";
import { appRootPath } from "@/lib/routing/app-path";
import { usePathname } from "next/navigation";

type AppHeaderTitleProps = Readonly<{
  setupCompleted?: boolean;
  setupTotalCount?: number;
}>;

export function AppHeaderTitle({
  setupCompleted = false,
  setupTotalCount = 4,
}: AppHeaderTitleProps) {
  const pathname = usePathname() ?? appRootPath();
  const { headerVariant, id, subtitle, title } = headerMetaFor(pathname, {
    completed: setupCompleted,
    totalCount: setupTotalCount,
  });
  const settingsHeader = headerVariant === "settings";

  return (
    <div className="min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2">
        <h1
          className={
            settingsHeader
              ? "m-0 truncate text-[21px] font-semibold leading-tight tracking-[-0.4px]"
              : "m-0 truncate text-lg font-semibold leading-tight tracking-[-0.4px] sm:text-[21px]"
          }
        >
          {title}
        </h1>
        {id ? <IdChip copyLabel="Copy run ID" size="xs" value={id} /> : null}
      </div>
      {subtitle ? (
        <div className="mt-1 hidden truncate text-[12.5px] text-fg-muted sm:block">{subtitle}</div>
      ) : null}
    </div>
  );
}
