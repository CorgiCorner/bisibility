"use client";

import type { ProviderAccessScope } from "@/lib/providers/access-scope";
import { createContext, type ReactNode, useContext } from "react";

const Context = createContext<ProviderAccessScope | null>(null);

export function ProviderAccessScopeProvider({
  children,
  scope,
}: Readonly<{
  children: ReactNode;
  scope: ProviderAccessScope;
}>) {
  return <Context.Provider value={scope}>{children}</Context.Provider>;
}

export function useProviderAccessScope() {
  return useContext(Context);
}
