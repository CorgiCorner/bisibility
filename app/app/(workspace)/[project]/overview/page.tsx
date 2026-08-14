import { dashboardRoute } from "@/lib/routing/dashboard-route";
import { redirect } from "next/navigation";

type OverviewPageProps = {
  params: Promise<{ project: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LegacyOverviewPage({
  params,
  searchParams,
}: Readonly<OverviewPageProps>) {
  const { project } = await params;
  const search = await searchParams;
  redirect(dashboardRoute(project, search));
}
