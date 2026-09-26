import { PREFERENCE_COOKIES, resolveLandingPreference } from "@/lib/account/preferences-shared";
import { navItems } from "@/lib/nav/nav-items";
import { getExperimentalModules } from "@/lib/queries/experimental-modules";
import { listWorkspaces } from "@/lib/queries/workspaces";
import { appPath } from "@/lib/routing/app-path";
import { hasExperimentalModule } from "@/lib/settings/experimental-modules";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function AppEntryPage() {
  // Only member projects are listed, so a default the user lost access to is never opened.
  const completedWorkspaces = (await listWorkspaces()).filter(
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
  // Timeline remains a landing preference even though it is outside the navigation rail.
  if (landing === "timeline" && hasExperimentalModule(enabledExperimentalModules, "timeline")) {
    redirect(appPath(completedWorkspace.publicId, landing));
  }
  const destination = navItems(
    completedWorkspace.publicId,
    undefined,
    enabledExperimentalModules,
  ).find((item) => item.href === appPath(completedWorkspace.publicId, landing));
  redirect(destination?.href ?? appPath(completedWorkspace.publicId, "dashboard"));
}
