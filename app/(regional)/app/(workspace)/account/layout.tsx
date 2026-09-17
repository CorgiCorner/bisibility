import { WorkspaceShell } from "@/app/(regional)/app/(workspace)/workspace-shell";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { resolveProjectAccess } from "@/lib/queries/_auth";
import { listWorkspaces } from "@/lib/queries/workspaces";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

type AccountLayoutProps = {
  children: ReactNode;
};

export default async function AccountLayout({ children }: Readonly<AccountLayoutProps>) {
  const [workspaces, runtime] = await Promise.all([
    listWorkspaces(),
    resolveRegionalDocumentLocale(),
  ]);
  const activeWorkspace = workspaces.find((workspace) => workspace.onboardingCompletedAt !== null);
  if (!activeWorkspace) {
    redirect("/onboarding");
  }
  const [access, messages] = await Promise.all([
    resolveProjectAccess(activeWorkspace.publicId),
    loadCoreMessages(runtime.locale, ["shared", "account"]),
  ]);

  return (
    <WorkspaceShell activeProjectId={access.projectId} projectRef={activeWorkspace.publicId}>
      <FeatureMessagesProvider
        locale={runtime.locale}
        messages={messages}
        timeZone={runtime.timeZone}
      >
        {children}
      </FeatureMessagesProvider>
    </WorkspaceShell>
  );
}
