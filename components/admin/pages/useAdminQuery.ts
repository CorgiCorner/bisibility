"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useTransition } from "react";
export function useAdminQuery() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const serialized = params?.toString() ?? "";
  const state = useRef({ observed: serialized, pending: serialized });
  if (state.current.observed !== serialized)
    state.current = { observed: serialized, pending: serialized };
  function update(values: Record<string, string | number | undefined>) {
    const next = new URLSearchParams(state.current.pending);
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined || value === "") next.delete(key);
      else next.set(key, String(value));
    }
    state.current.pending = next.toString();
    start(() => router.push(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  }
  return { params, pending, update, refresh: () => start(() => router.refresh()), router };
}
