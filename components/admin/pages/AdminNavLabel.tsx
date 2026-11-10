"use client";
import { useLinkStatus } from "next/link";
import type { ReactNode } from "react";

/** Link-local pending state also covers navigation that retains existing content. */
export function AdminNavLabel({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <span className="inline-flex items-center gap-2" aria-busy={pending}>
      {children}
      {pending && (
        <span
          aria-hidden
          className="h-3 w-3 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin"
        />
      )}
    </span>
  );
}
