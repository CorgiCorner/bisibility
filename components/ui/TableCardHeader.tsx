import { cn } from "@/lib/ui/cn";
import type { ReactNode } from "react";

export function TableCardHeader({
  actions,
  className,
  title,
  titleId,
}: Readonly<{ actions: ReactNode; className?: string; title: ReactNode; titleId: string }>) {
  return (
    <header
      className={cn("flex flex-wrap items-center justify-between gap-3 px-4 py-3.5", className)}
    >
      <h2 className="m-0 text-[15px] font-semibold text-fg" id={titleId}>
        {title}
      </h2>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>
    </header>
  );
}
