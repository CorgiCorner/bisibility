import { resolveProjectAccess } from "@/lib/queries/_auth";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import { redirect } from "next/navigation";

export default async function LegacySchedulesPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ project: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const route = await params;
  const access = await resolveProjectAccess(route.project);
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries((await searchParams) ?? {})) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value])
      search.append(key, item);
  }
  const suffix = search.size ? `?${search}` : "";
  redirect(projectSchedulesPath(access.publicId) + suffix);
}
