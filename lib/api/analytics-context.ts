import { apiAnalyticsIdentity } from "@/lib/analytics/api-server";
import type { ApiAuth } from "./auth";

export function requestAnalyticsIdentity(auth: ApiAuth, projectId: string, headers: Headers) {
  return apiAnalyticsIdentity(
    {
      userId: auth.kind === "personal_token" ? auth.user.id : (auth.project.ownerId ?? ""),
      projectId,
      authKind: auth.kind === "personal_token" && auth.oauthClientId ? "oauth" : auth.kind,
    },
    headers,
  );
}
