import { cn } from "@/lib/ui/cn";
import type { ComponentProps } from "react";
export function Divider({ className, ...props }: ComponentProps<"hr">) {
  return <hr className={cn("my-2 border-0 border-t border-border", className)} {...props} />;
}
