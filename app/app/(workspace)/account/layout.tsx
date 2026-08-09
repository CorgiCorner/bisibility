import { WorkspaceShell } from "@/app/app/(workspace)/workspace-shell";
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

  return (
    <WorkspaceShell activeProjectId={activeWorkspace.id} projectRef={activeWorkspace.publicId}>
      {children}
    </WorkspaceShell>
  );
}
