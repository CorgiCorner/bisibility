import { appPath } from "@/lib/routing/app-path";
export function measurementRecovery(projectId: string, reason: string) {
  if (
    ["provider_missing", "provider_disabled", "provider_disconnected", "needs_reauth"].includes(
      reason,
    )
  )
    return { href: appPath(projectId, "integrations"), label: "provider" as const };
  if (reason === "default_geo_unavailable")
    return { href: appPath(projectId, "markets"), label: "market" as const };
  if (reason === "defaults_missing")
    return {
      href: `${appPath(projectId, "settings", "tracking")}#check-defaults`,
      label: "defaults" as const,
    };
  if (reason === "measurement_policy_unconfigured" || reason === "measurement_policy_unsupported")
    return {
      href: `${appPath(projectId, "settings", "tracking")}#measurement-policy`,
      label: "policy" as const,
    };
  return {
    href: `${appPath(projectId, "settings", "tracking")}#measurement-settings`,
    label: "review" as const,
  };
}
