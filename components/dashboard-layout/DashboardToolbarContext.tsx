"use client";

import { createContext, type ReactNode, useContext } from "react";

type DashboardToolbarControls = Readonly<{ preset: ReactNode; customization: ReactNode }>;
const DashboardToolbarContext = createContext<DashboardToolbarControls | null>(null);

function DashboardToolbarProvider({
  children,
  controls,
}: Readonly<{ children: ReactNode; controls: DashboardToolbarControls }>) {
  return (
    <DashboardToolbarContext.Provider value={controls}>{children}</DashboardToolbarContext.Provider>
  );
}

export function useDashboardToolbarControls() {
  return useContext(DashboardToolbarContext);
}

export function DashboardToolbarSurface({
  integrated,
  authorized,
  scope,
  controls,
  scopeLabel,
  unavailable,
  status,
}: Readonly<{
  integrated: boolean;
  authorized: boolean;
  scope: ReactNode;
  controls: DashboardToolbarControls;
  scopeLabel: string;
  unavailable: string;
  status: ReactNode;
}>) {
  const standalone = (
    <div className="flex flex-wrap items-center gap-2">
      {controls.preset}
      {controls.customization}
    </div>
  );
  if (!integrated)
    return (
      <div className="flex flex-wrap items-center gap-2">
        {controls.preset}
        {controls.customization}
        {status}
      </div>
    );
  return (
    <>
      <section aria-label={scopeLabel} data-dashboard-shell="scope">
        <DashboardToolbarProvider controls={controls}>
          {authorized && scope != null && scope !== false ? (
            scope
          ) : (
            <>
              {standalone}
              <p>{unavailable}</p>
            </>
          )}
        </DashboardToolbarProvider>
      </section>
      {status}
    </>
  );
}
