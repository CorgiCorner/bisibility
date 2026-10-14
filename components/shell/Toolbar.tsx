import { cn } from "@/lib/ui/cn";
import type { ReactNode } from "react";

export type ToolbarProps = {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  wrapControls?: boolean;
};

export function Toolbar({
  action,
  children,
  className,
  wrapControls = false,
}: Readonly<ToolbarProps>) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-border bg-bg px-4 py-[11px] sm:px-5 lg:px-7",
        wrapControls && "items-start",
        className,
      )}
    >
      <div
        className={cn(
          "flex min-w-0 items-center gap-2 overflow-x-auto pb-0.5",
          wrapControls && "flex-1 flex-wrap overflow-visible pb-0",
        )}
      >
        {children}
      </div>
      {action ? <div className="flex-none">{action}</div> : null}
    </div>
  );
}
