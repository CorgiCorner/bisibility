import { cn } from "@/lib/ui/cn";
import type { ComponentPropsWithoutRef } from "react";

const variantClasses = {
  analytics: "mx-auto max-w-[1400px]",
  constrained: "mx-auto max-w-[1040px]",
  form: "max-w-settings",
} as const;

type PageContentProps = ComponentPropsWithoutRef<"div"> & {
  variant?: keyof typeof variantClasses;
};

export function PageContent({ className, variant = "analytics", ...props }: PageContentProps) {
  return <div className={cn("w-full min-w-0", variantClasses[variant], className)} {...props} />;
}
