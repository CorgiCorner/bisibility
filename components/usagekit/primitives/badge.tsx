import { PillBadge } from "@/components/ui/Pill";
import type { ComponentProps } from "react";
export function Badge({
  variant: _variant,
  ...props
}: ComponentProps<"span"> & {
  variant?: "secondary" | "outline";
}) {
  return <PillBadge {...props} />;
}
