import { listWorkspaces } from "@/lib/queries/workspaces";
import { appPath } from "@/lib/routing/app-path";
import { redirect } from "next/navigation";

export default async function AppEntryPage() {
  const completedWorkspace = (await listWorkspaces()).find(
    (workspace) => workspace.onboardingCompletedAt !== null,
  );
  redirect(completedWorkspace ? appPath(completedWorkspace.publicId, "overview") : "/onboarding");
}
