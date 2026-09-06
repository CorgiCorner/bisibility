import { WorkspaceShell } from "@/app/app/(workspace)/workspace-shell";
import { MarketContextProvider } from "@/components/markets/MarketContextProvider";
import { resolveProjectAccess } from "@/lib/queries/_auth";
import type { ReactNode } from "react";

type ProjectLayoutProps = {
  children: ReactNode;
  /**
   * The header context slot, resolved as a parallel route rather than fetched here. A layout is
   * rendered once for the whole project subtree, so anything read here is read on every project
   * route - including the ones where the slot shows nothing. `@context` is matched against the
   * URL instead, so the market list is read only where it can be displayed.
   */
  context: ReactNode;
  params: Promise<{ project: string }>;
};

export default async function ProjectLayout({
  children,
  context,
  params,
}: Readonly<ProjectLayoutProps>) {
  const { project } = await params;
  const access = await resolveProjectAccess(project);

  return (
    // The project level, wrapping the SHELL and not just the page. The chrome - header, rail,
    // command palette - is where a market switcher belongs, and as a sibling of the provider it
    // could not read the context at all. A market route nests its own provider inside this one,
    // around the page body it renders.
    <MarketContextProvider market={null} projectRef={access.publicId}>
      <WorkspaceShell
        activeProjectId={access.projectId}
        context={context}
        projectRef={access.publicId}
      >
        {children}
      </WorkspaceShell>
    </MarketContextProvider>
  );
}
