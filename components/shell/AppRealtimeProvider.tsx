"use client";

import { AppRealtimeContext, useAppRealtimeState } from "@/lib/realtime/useAppRealtime";
import { useRouter } from "next/navigation";
import { type ReactNode, useTransition } from "react";

export { useAppRealtime } from "@/lib/realtime/useAppRealtime";

export function AppRealtimeProvider({
  children,
  projectRef,
}: Readonly<{ children: ReactNode; projectRef: string }>) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const value = useAppRealtimeState(projectRef, () => {
    startTransition(() => router.refresh());
  });
  return <AppRealtimeContext.Provider value={value}>{children}</AppRealtimeContext.Provider>;
}
