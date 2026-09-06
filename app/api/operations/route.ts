import "server-only";

import { errorResponse, resourceResponse } from "@/lib/api/responses";
import { getSession } from "@/lib/auth/session";
import { resolveProjectAccess } from "@/lib/queries/_auth";
import { readOperationSnapshot } from "@/lib/rank-check/runs/snapshot";
import { isHTTPAccessFallbackError } from "next/dist/client/components/http-access-fallback/http-access-fallback";
import { unstable_rethrow } from "next/navigation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const instance = "urn:bisibility:api:operations";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return errorResponse("unauthorized", "Authentication is required.", 401, {
      headers,
      instance,
    });
  }

  try {
    const projectRef = new URL(request.url).searchParams.get("project");
    if (!projectRef) {
      return errorResponse("bad_request", "Project is required.", 400, { headers, instance });
    }
    const { projectId } = await resolveProjectAccess(projectRef);
    const operations = await readOperationSnapshot(projectId);
    return resourceResponse({ operations }, { headers });
  } catch (error) {
    unstable_rethrow(error);
    if (isHTTPAccessFallbackError(error)) throw error;
    return errorResponse("internal_server_error", "Operations are unavailable.", 500, {
      headers,
      instance,
    });
  }
}
