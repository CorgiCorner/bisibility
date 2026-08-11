"use client";

import { headerMetaFor } from "@/components/shell/header-title";
import { appRootPath } from "@/lib/routing/app-path";
import { usePathname } from "next/navigation";

export type AppHeaderTitleProps = {
  keywordCount?: number;
  projectDomain?: string | null;
};

export function AppHeaderTitle({ keywordCount, projectDomain }: Readonly<AppHeaderTitleProps>) {
  const { subtitle, subtitleVariant, title } = headerMetaFor(usePathname() ?? appRootPath(), {
    keywordCount,
    projectDomain,
  });
  const settingsHeader = subtitleVariant === "project-domain";

  return (
    <div className="min-w-0 overflow-hidden">
      <h1
        className={
          settingsHeader
            ? "m-0 truncate text-[21px] font-semibold leading-tight tracking-[-0.4px]"
            : "m-0 truncate text-lg font-semibold leading-tight tracking-[-0.4px] sm:text-[21px]"
        }
      >
        {title}
      </h1>
      {subtitle ? (
        <div
          className={
            settingsHeader
              ? "mt-1 hidden truncate font-mono text-[12.5px] text-fg-muted sm:block"
              : "mt-1 hidden truncate text-[12.5px] text-fg-muted sm:block"
          }
        >
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}
