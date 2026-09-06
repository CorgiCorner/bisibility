import { MARKETS_SECTION } from "@/lib/markets/market-routes";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { redirect } from "next/navigation";

type MarketsSettingsPageProps = { params: Promise<{ project: string }> };

/**
 * The settings section this name once had. `markets` is now a project-level route of its own,
 * so the retired address points there instead of jumping straight into tracking settings.
 */
export default async function MarketsSettingsPage({ params }: Readonly<MarketsSettingsPageProps>) {
  const { project: projectRef } = await params;
  redirect(appPath(asProjectRef(projectRef), MARKETS_SECTION));
}
