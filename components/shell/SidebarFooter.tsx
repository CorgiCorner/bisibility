export type { ShellUser } from "@/components/shell/types";

import { PlanStatusBadge } from "@/components/shell/PlanStatusBadge";
import type { PlanStatus } from "@/components/shell/plan-status";
import type { ShellUser } from "@/components/shell/types";
import { BrandLockup } from "@/components/ui/BrandLockup";

export type SidebarFooterProps = {
  collapsed?: boolean;
  showBrand?: boolean;
  /** Kept so callers do not have to change; the account control now lives in AppHeader. */
  onNavigate?: () => void;
  planStatus?: PlanStatus | null;
  projectRef?: string;
  showHostedLinks?: boolean;
  user?: ShellUser;
  version?: string;
};

export function SidebarFooter({
  collapsed = false,
  planStatus = null,
  projectRef,
  showBrand = false,
  version,
}: Readonly<SidebarFooterProps>) {
  const badge =
    planStatus && projectRef ? (
      <PlanStatusBadge collapsed={collapsed} projectRef={projectRef} status={planStatus} />
    ) : null;

  if (!showBrand && !version && !badge) {
    return null;
  }

  return (
    <div
      className={`flex flex-none items-center pt-3 ${
        collapsed ? "flex-col justify-center gap-2" : "justify-between px-[11px]"
      }`}
    >
      {showBrand && !collapsed ? (
        <span className="ml-[7px] inline-flex min-w-0 items-center gap-2">
          <BrandLockup color="var(--fg-muted)" size="xs" />
          {badge}
        </span>
      ) : (
        badge
      )}
      {version ? (
        <p
          className={`m-0 flex h-4 items-center leading-4 text-fg-muted tabular-nums ${
            collapsed ? "justify-center text-[9px]" : "ml-auto text-[10px]"
          }`}
        >
          v{version}
        </p>
      ) : null}
    </div>
  );
}
