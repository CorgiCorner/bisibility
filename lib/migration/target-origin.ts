import "server-only";

import { isSelfHost } from "@/lib/deployment/deployment";
import { defaultSiteUrl, resolveSiteUrl } from "@/lib/seo/jsonld";
import { validateMigrationTargetUrl } from "./target-url";

export function configuredMigrationTargetOrigin() {
  return resolveSiteUrl(process.env.BISIBILITY_CLOUD_URL ?? defaultSiteUrl);
}

export function resolveMigrationTargetOrigin(raw: string | undefined) {
  const configured = raw === undefined;
  const validation = validateMigrationTargetUrl(raw ?? configuredMigrationTargetOrigin(), {
    allowHttp: isSelfHost,
    allowPrivateHosts: isSelfHost,
  });
  if (!validation.ok) {
    return {
      ok: false as const,
      reason: configured
        ? `Migration target configuration is invalid. Check BISIBILITY_CLOUD_URL or the site URL. ${validation.reason}`
        : validation.reason,
    };
  }
  return validation;
}
