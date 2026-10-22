import { getSession } from "@/lib/auth/session";
import { listWorkspaces } from "@/lib/queries/workspaces";
import { appPath } from "@/lib/routing/app-path";
import { DOCS_URL } from "@/lib/site/site";
import { redirect } from "next/navigation";

export default async function InstallEntryPage() {
  const session = await getSession();
  if (!session) redirect(`${DOCS_URL}/agents`);

  const completedWorkspaces = (await listWorkspaces()).filter(
    (workspace) => workspace.onboardingCompletedAt !== null,
  );
  const workspace =
    completedWorkspaces.find((candidate) => candidate.isDefault) ?? completedWorkspaces[0];
  if (!workspace) redirect("/onboarding");
  redirect(appPath(workspace.publicId, "install"));
}
