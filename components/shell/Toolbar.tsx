import type { ReactNode } from "react";

export type ToolbarProps = {
  action?: ReactNode;
  children: ReactNode;
};

export function Toolbar({ action, children }: Readonly<ToolbarProps>) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border bg-bg px-4 py-[11px] sm:px-5 lg:px-7">
      <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-0.5">{children}</div>
      {action ? <div className="flex-none">{action}</div> : null}
    </div>
  );
}
