import { WorkspaceShell } from "@/app/app/(workspace)/workspace-shell";
import { resolveProjectAccess } from "@/lib/queries/_auth";
import type { ReactNode } from "react";

type ProjectLayoutProps = {
  children: ReactNode;
  params: Promise<{ project: string }>;
};

export default async function ProjectLayout({ children, params }: Readonly<ProjectLayoutProps>) {
  const { project } = await params;
  const access = await resolveProjectAccess(project);

  return (
    <WorkspaceShell activeProjectId={access.projectId} projectRef={access.publicId}>
      {children}
    </WorkspaceShell>
  );
}
