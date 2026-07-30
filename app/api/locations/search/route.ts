import { locationSearchMemberProjectId, searchLocations } from "@/lib/api/locations-search";
import { checkRateLimit, rateLimitExceeded } from "@/lib/api/ratelimit";
import { errorResponse, listResponse } from "@/lib/api/responses";
import { getSession } from "@/lib/auth/session";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const INSTANCE = "urn:bisibility:api:locations:search";

// Global locations are readable by any authenticated user; provider cache-miss
// resolution requires membership in the optional `project`.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return errorResponse("unauthorized", "Authentication is required.", 401, {
      instance: INSTANCE,
    });
  }

  const limit = await checkRateLimit(req, { id: session.user.id, kind: "api-key" });
  if (!limit.success) {
    return rateLimitExceeded(limit);
  }

  const url = new URL(req.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const country = url.searchParams.get("country");
  if (query.length < 1) {
    return listResponse([], null, {});
  }

  const projectId = await locationSearchMemberProjectId(
    session.user.id,
    url.searchParams.get("project"),
  );
  const { candidates, warning } = await searchLocations({ country, projectId, query });

  return listResponse(candidates, null, {
    headers: warning ? new Headers({ "x-location-warning": warning }) : undefined,
  });
}
