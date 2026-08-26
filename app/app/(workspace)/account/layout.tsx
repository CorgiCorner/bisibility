import { WorkspaceShell } from "@/app/app/(workspace)/workspace-shell";
import { resolveProjectAccess } from "@/lib/queries/_auth";
import { listWorkspaces } from "@/lib/queries/workspaces";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

type AccountLayoutProps = {
  children: ReactNode;
};

export default async function AccountLayout({ children }: Readonly<AccountLayoutProps>) {
  const activeWorkspace = (await listWorkspaces()).find(
    (workspace) => workspace.onboardingCompletedAt !== null,
  );
  if (!activeWorkspace) {
    redirect("/onboarding");
  }
  const access = await resolveProjectAccess(activeWorkspace.publicId);

  return (
    <WorkspaceShell activeProjectId={access.projectId} projectRef={activeWorkspace.publicId}>
      {children}
    </WorkspaceShell>
  );
}
