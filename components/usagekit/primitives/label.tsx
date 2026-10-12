import { cn } from "@/lib/ui/cn";
import type { ComponentProps } from "react";

/** shadcn's Label in Bisibility's field label type. Callers associate it through htmlFor. */
export function Label({ children, className, htmlFor, ...props }: ComponentProps<"label">) {
  return (
    <label
      {...props}
      htmlFor={htmlFor}
      className={cn("text-[10px] uppercase tracking-[0.5px] text-fg-muted", className)}
    >
      {children}
    </label>
  );
}
