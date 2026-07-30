"use client";

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

type SessionSpendContextValue = {
  addSpend: (cents: number) => void;
  sessionCents: number;
};

const SessionSpendContext = createContext<SessionSpendContextValue | null>(null);

export function SessionSpendProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [sessionCents, setSessionCents] = useState(0);
  const addSpend = useCallback((cents: number) => {
    if (!Number.isFinite(cents) || cents <= 0) return;
    setSessionCents((current) => current + cents);
  }, []);
  const value = useMemo(() => ({ addSpend, sessionCents }), [addSpend, sessionCents]);

  return <SessionSpendContext.Provider value={value}>{children}</SessionSpendContext.Provider>;
}

export function useSessionSpend() {
  const value = useContext(SessionSpendContext);
  if (!value) {
    throw new Error("useSessionSpend must be used within SessionSpendProvider");
  }
  return value;
}
