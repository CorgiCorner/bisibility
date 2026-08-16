import { PREFERENCE_COOKIES, resolveLandingPreference } from "@/lib/account/preferences-shared";
import { listWorkspaces } from "@/lib/queries/workspaces";
import { appPath } from "@/lib/routing/app-path";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function AppEntryPage() {
  const completedWorkspace = (await listWorkspaces()).find(
    (workspace) => workspace.onboardingCompletedAt !== null,
  );
  if (!completedWorkspace) {
    redirect("/onboarding");
  }
  const store = await cookies();
  const landing = resolveLandingPreference(store.get(PREFERENCE_COOKIES.landing)?.value);
  redirect(appPath(completedWorkspace.publicId, landing));
}
