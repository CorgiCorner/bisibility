import { resolveProjectAccess } from "@/lib/queries/_auth";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import { permanentRedirect } from "next/navigation";

export default async function LegacySchedulePage({
  params,
}: Readonly<{ params: Promise<{ project: string; publicId: string }> }>) {
  const { project, publicId: scheduleId } = await params;
  const { publicId } = await resolveProjectAccess(project);
  permanentRedirect(projectSchedulesPath(publicId, scheduleId));
}
