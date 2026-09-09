import { cn } from "@/lib/ui/cn";
import { cva } from "class-variance-authority";
import type { ComponentProps, ElementType } from "react";
export type CardProps = ComponentProps<"div"> & {
  component?: ElementType;
  radius?: "card";
  size?: "sm" | "md" | "lg";
};
const cardVariants = cva("rounded-card border border-border bg-bg-elev text-fg", {
  variants: { size: { sm: "p-3", md: "p-4", lg: "p-5" } },
});
export function Card({
  className,
  component: Component = "div",
  radius: _radius,
  size = "md",
  ...props
}: CardProps) {
  return (
    <Component data-slot="card" className={cn(cardVariants({ size }), className)} {...props} />
  );
}
