import { cn } from "@/lib/ui/cn";
import { FLOATING_DRAWER_GRAB_CLASS } from "@/lib/ui/floating-drawer";
import type { ComponentProps } from "react";

/** Decorative grab. Callers wire the swipe handlers; this node stays out of the accessibility tree. */
export function FloatingDrawerGrab({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      aria-hidden="true"
      className={cn("flex touch-none justify-center pt-2", className)}
      data-drawer-grab=""
    >
      <span className={FLOATING_DRAWER_GRAB_CLASS} />
    </div>
  );
}
