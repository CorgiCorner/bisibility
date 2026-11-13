import { PREFERENCE_COOKIES, resolveLandingPreference } from "@/lib/account/preferences-shared";
import { canProjectAction } from "@/lib/auth/capabilities";
import { projectSeoChallengeEnabled } from "@/lib/challenge-report/feature";
import { isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import { navItems } from "@/lib/nav/nav-items";
import { getExperimentalModules } from "@/lib/queries/experimental-modules";
import { listWorkspaces } from "@/lib/queries/workspaces";
import { appPath } from "@/lib/routing/app-path";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function AppEntryPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<{ challenge?: string }> }> = {}) {
  const workspaces = await listWorkspaces();
  if ((await searchParams)?.challenge === "1" && (await projectSeoChallengeEnabled())) {
    const eligible = workspaces.filter(
      (workspace) =>
        canProjectAction(workspace.role, "create", "project") &&
        !isProjectReadOnly(workspace.writeMode),
    );
    const target = eligible.find((workspace) => workspace.isDefault) ?? eligible[0];
    if (target) redirect(`${appPath(target.publicId, "pages")}#seo-challenge`);
    redirect("/onboarding?new=1&challenge=1");
  }
  // Only member projects are listed, so a default the user lost access to is never opened.
  const completedWorkspaces = workspaces.filter(
    (workspace) => workspace.onboardingCompletedAt !== null,
  );
  const completedWorkspace =
    completedWorkspaces.find((workspace) => workspace.isDefault) ?? completedWorkspaces[0];
  if (!completedWorkspace) {
    redirect("/onboarding");
  }
  const store = await cookies();
  const landing = resolveLandingPreference(store.get(PREFERENCE_COOKIES.landing)?.value);
  const enabledExperimentalModules = await getExperimentalModules(completedWorkspace.publicId);
  const destination = navItems(
    completedWorkspace.publicId,
    undefined,
    enabledExperimentalModules,
  ).find((item) => item.href === appPath(completedWorkspace.publicId, landing));
  redirect(destination?.href ?? appPath(completedWorkspace.publicId, "dashboard"));
}
