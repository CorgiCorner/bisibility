import { cn } from "@/lib/ui/cn";
import type { ComponentProps, ElementType } from "react";
export type SectionTitleProps = ComponentProps<"h2"> & {
  component?: ElementType;
  size?: "sm" | "md" | "lg";
};
const sizes = { sm: "text-[13px] leading-snug", md: "text-ui-section", lg: "text-lg leading-snug" };
export function SectionTitle({
  className,
  component: Component = "h2",
  size = "md",
  ...props
}: SectionTitleProps) {
  return (
    <Component
      className={cn(
        "font-semibold text-fg",
        size !== "md" && sizes[size],
        className,
        size === "md" && sizes[size],
      )}
      {...props}
    />
  );
}
