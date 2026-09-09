"use client";

import { useHydrationMarker } from "@/lib/ui/use-hydration-marker";
import type { ReactNode } from "react";

export function Providers({ children }: Readonly<{ children: ReactNode }>) {
  useHydrationMarker();
  return children;
}
