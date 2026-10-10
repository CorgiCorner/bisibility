import { getAgentWorkspacePermissions } from "@/lib/queries/agent-workspace";
import type { ReactNode } from "react";
import { AgentWorkspaceAccessProvider } from "./AgentWorkspaceAccessProvider";

export default async function AgentWorkspaceLayout({
  children,
  params,
}: Readonly<{ children: ReactNode; params: Promise<{ project: string }> }>) {
  const { project } = await params;
  const permissions = await getAgentWorkspacePermissions(project);
  return (
    <AgentWorkspaceAccessProvider value={permissions}>{children}</AgentWorkspaceAccessProvider>
  );
}
