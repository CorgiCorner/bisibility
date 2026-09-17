import { resolveProjectAccess } from "@/lib/queries/_auth";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import { permanentRedirect } from "next/navigation";

export default async function LegacySchedulesPage({
  params,
}: Readonly<{ params: Promise<{ project: string }> }>) {
  const { project } = await params;
  const { publicId } = await resolveProjectAccess(project);
  permanentRedirect(projectSchedulesPath(publicId));
}
