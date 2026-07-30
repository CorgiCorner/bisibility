import { cn } from "@/lib/ui/cn";
import type { ReactNode } from "react";

export type ChartRegionProps = {
  children: ReactNode;
  className?: string;
  label: string;
};

export function ChartRegion({ children, className, label }: Readonly<ChartRegionProps>) {
  return (
    <section aria-label={label} className={cn("min-w-0", className)}>
      {children}
    </section>
  );
}
