"use client";
import { Portal as RadixPortal } from "@radix-ui/react-portal";
import type { ReactNode } from "react";
export function Portal({ children }: { children: ReactNode }) {
  return <RadixPortal asChild>{children}</RadixPortal>;
}
