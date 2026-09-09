export type { ShellUser } from "@/components/shell/types";

import type { ShellUser } from "@/components/shell/types";
import { BrandLockup } from "@/components/ui/BrandLockup";

export type SidebarFooterProps = {
  collapsed?: boolean;
  showBrand?: boolean;
  /** Kept so callers do not have to change; the account control now lives in AppHeader. */
  onNavigate?: () => void;
  showHostedLinks?: boolean;
  user?: ShellUser;
  version?: string;
};

export function SidebarFooter({
  collapsed = false,
  showBrand = false,
  version,
}: Readonly<SidebarFooterProps>) {
  if (!showBrand && !version) {
    return null;
  }

  return (
    <div
      className={`flex flex-none items-center pt-3 ${collapsed ? "justify-center" : "justify-between px-[11px]"}`}
    >
      {showBrand && !collapsed ? (
        <span className="ml-[7px] inline-flex">
          <BrandLockup color="var(--fg-muted)" size="xs" />
        </span>
      ) : null}
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
