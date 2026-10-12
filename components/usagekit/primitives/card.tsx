import { Card as HostCard } from "@/components/ui/Card";
import { cn } from "@/lib/ui/cn";
import type { ComponentProps } from "react";

type Props = ComponentProps<"div">;
export function Card({ className, ...props }: Props) {
  return <HostCard {...props} className={cn("flex flex-col gap-4", className)} />;
}
export function CardHeader({ className, ...props }: Props) {
  return <div {...props} className={cn("space-y-1", className)} />;
}
export function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return <h3 {...props} className={cn("text-sm font-semibold text-fg", className)} />;
}
export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return <p {...props} className={cn("text-xs text-fg-muted", className)} />;
}
export function CardContent(props: Props) {
  return <div {...props} />;
}
