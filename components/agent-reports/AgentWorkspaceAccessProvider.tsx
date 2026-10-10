"use client";

import { createContext, type ReactNode, useContext } from "react";

type WorkspaceAccess = { canCreate: boolean; canEdit: boolean };
const WorkspaceAccessContext = createContext<WorkspaceAccess>({ canCreate: true, canEdit: true });

export function AgentWorkspaceAccessProvider({
  children,
  value,
}: Readonly<{ children: ReactNode; value: WorkspaceAccess }>) {
  return (
    <WorkspaceAccessContext.Provider value={value}>{children}</WorkspaceAccessContext.Provider>
  );
}

export function useAgentWorkspaceAccess() {
  return useContext(WorkspaceAccessContext);
}
