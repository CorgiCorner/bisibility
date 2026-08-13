import { cn } from "@/lib/ui/cn";
import type { ComponentPropsWithoutRef } from "react";

export type KbdProps = ComponentPropsWithoutRef<"kbd">;

export function Kbd({ className, ...props }: KbdProps) {
  return (
    <kbd
      className={cn(
        "inline-grid h-5 min-w-5 shrink-0 place-items-center rounded-[5px] border border-border-strong bg-bg-sunken px-1 font-mono text-[10px] font-semibold leading-none text-fg-muted",
        className,
      )}
      {...props}
    />
  );
}
