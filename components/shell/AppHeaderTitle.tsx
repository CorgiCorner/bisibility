"use client";

import { headerMetaFor } from "@/components/shell/header-title";
import { appRootPath } from "@/lib/routing/app-path";
import { usePathname } from "next/navigation";

export type AppHeaderTitleProps = {
  keywordCount?: number;
};

export function AppHeaderTitle({ keywordCount }: Readonly<AppHeaderTitleProps>) {
  const { subtitle, title } = headerMetaFor(usePathname() ?? appRootPath(), { keywordCount });

  return (
    <div className="min-w-0 overflow-hidden">
      <h1 className="m-0 truncate text-lg font-semibold leading-tight tracking-[-0.4px] sm:text-[21px]">
        {title}
      </h1>
      {subtitle ? (
        <div className="mt-1 hidden truncate text-[12.5px] text-fg-muted sm:block">{subtitle}</div>
      ) : null}
    </div>
  );
}
