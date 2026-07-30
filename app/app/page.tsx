import { listWorkspaces } from "@/lib/queries/workspaces";
import { appPath } from "@/lib/routing/app-path";
import { redirect } from "next/navigation";

export default async function AppEntryPage() {
  const firstWorkspace = (await listWorkspaces())[0];
  redirect(firstWorkspace ? appPath(firstWorkspace.publicId, "overview") : "/onboarding");
}
