"use client";

import { AppRealtimeContext, useAppRealtimeState } from "@/lib/realtime/useAppRealtime";
import type { ReactNode } from "react";

export { useAppRealtime } from "@/lib/realtime/useAppRealtime";

export function AppRealtimeProvider({
  children,
  projectRef,
}: Readonly<{ children: ReactNode; projectRef: string }>) {
  const value = useAppRealtimeState(projectRef);
  return <AppRealtimeContext.Provider value={value}>{children}</AppRealtimeContext.Provider>;
}
