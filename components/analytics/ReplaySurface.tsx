"use client";

import { notifyReplaySurfaces, type ReplaySurfaceKind } from "@/lib/analytics/replay-policy";
import type { ReactNode } from "react";

// Ref callbacks synchronize mounted recording boundaries before a passive effect can run.
function registerSurface(node: HTMLDivElement | null) {
  if (!node) return;
  notifyReplaySurfaces();
  return () => {
    node.removeAttribute("data-replay-surface");
    notifyReplaySurfaces();
  };
}

export function ReplaySurface({
  children,
  kind,
  className,
}: Readonly<{
  children: ReactNode;
  kind: ReplaySurfaceKind;
  className?: string;
}>) {
  return (
    <div className={className} data-replay-surface={kind} ref={registerSurface}>
      {children}
    </div>
  );
}
