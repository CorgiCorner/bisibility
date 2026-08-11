"use client";

import type { ReactNode } from "react";
import { createContext, useContext } from "react";

export type ClientDeploymentMode = "cloud" | "self-host";

// A missing provider must never expose hosted stack details.
const DeploymentModeContext = createContext<ClientDeploymentMode>("cloud");

export function DeploymentModeProvider({
  children,
  deploymentMode,
}: Readonly<{
  children: ReactNode;
  deploymentMode: ClientDeploymentMode;
}>) {
  return (
    <DeploymentModeContext.Provider value={deploymentMode}>
      {children}
    </DeploymentModeContext.Provider>
  );
}

export function useDeploymentMode() {
  return useContext(DeploymentModeContext);
}
