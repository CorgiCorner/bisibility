import { cn } from "@/lib/ui/cn";
import type { ComponentPropsWithoutRef } from "react";

type PageContentProps = ComponentPropsWithoutRef<"div"> & {
  variant?: "analytics" | "form";
};

export function PageContent({ className, variant = "analytics", ...props }: PageContentProps) {
  return (
    <div
      className={cn(
        "w-full min-w-0",
        variant === "form" ? "max-w-[780px]" : "mx-auto max-w-[1400px]",
        className,
      )}
      {...props}
    />
  );
}
