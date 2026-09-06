"use client";

import {
  GETTING_STARTED_LABEL,
  gettingStartedProgressAriaLabel,
} from "@/components/getting-started/getting-started-copy";
import { SetupProgressRing } from "@/components/getting-started/SetupProgressRing";
import { Tooltip } from "@/components/ui";
import { appPath } from "@/lib/routing/app-path";
import Link from "next/link";

export type GettingStartedNavLinkProps = Readonly<{
  collapsed?: boolean;
  currentHref: string;
  doneCount: number;
  onNavigate?: () => void;
  projectRef: string;
  setupComplete?: boolean;
  settledCount: number;
  totalCount: number;
}>;

export function GettingStartedNavLink({
  collapsed = false,
  currentHref,
  doneCount,
  onNavigate,
  projectRef,
  setupComplete: _setupComplete = false,
  settledCount,
  totalCount,
}: GettingStartedNavLinkProps) {
  const href = appPath(projectRef, "getting-started");
  const active = currentHref === href || currentHref.startsWith(`${href}/`);
  const progressLabel = gettingStartedProgressAriaLabel(settledCount, totalCount);

  return (
    <Tooltip
      content={collapsed ? progressLabel : ""}
      placement="right"
      wrapperClassName={collapsed ? undefined : "w-full"}
    >
      <Link
        aria-current={active ? "page" : undefined}
        aria-label={collapsed ? progressLabel : undefined}
        className={[
          "flex h-9 items-center rounded-control border border-border bg-bg-elev text-[13.5px] font-semibold text-fg transition-colors duration-150 hover:border-border-control hover:bg-bg-sunken active:bg-bg-inset focus-visible:-outline-offset-2",
          collapsed
            ? "ml-5.5 mb-2 w-9 justify-center p-0"
            : "ml-2.5 mb-2 w-[calc(100%-10px)] gap-2.5 pr-[11px] pl-[1px]",
        ].join(" ")}
        data-getting-started-nav
        href={href}
        onClick={onNavigate}
      >
        <span className="grid h-[30px] w-[30px] flex-none place-items-center">
          <SetupProgressRing doneCount={doneCount} size={20} totalCount={totalCount} />
        </span>
        {collapsed ? null : (
          <span className="min-w-0 flex-1 truncate">{GETTING_STARTED_LABEL}</span>
        )}
      </Link>
    </Tooltip>
  );
}
