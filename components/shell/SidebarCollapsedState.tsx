"use client";

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

type SidebarCollapsedContextValue = {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
};

const SidebarCollapsedContext = createContext<SidebarCollapsedContextValue | null>(null);

export function SidebarCollapsedProvider({
  children,
  defaultCollapsed,
}: Readonly<{
  children: ReactNode;
  defaultCollapsed: boolean;
}>) {
  const [collapsed, setCollapsedState] = useState(defaultCollapsed);
  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next);
    // biome-ignore lint/suspicious/noDocumentCookie: The sidebar preference must survive the next server request.
    document.cookie = `sidebar-collapsed=${next}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  }, []);
  const value = useMemo(() => ({ collapsed, setCollapsed }), [collapsed, setCollapsed]);

  return (
    <SidebarCollapsedContext.Provider value={value}>{children}</SidebarCollapsedContext.Provider>
  );
}

export function useSidebarCollapsed() {
  const value = useContext(SidebarCollapsedContext);
  if (!value) {
    throw new Error("useSidebarCollapsed must be used within SidebarCollapsedProvider");
  }

  return value;
}
