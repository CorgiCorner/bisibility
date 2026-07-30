import "server-only";

import { getActionActor, requireProjectScope } from "@/lib/actions/_shared";
import { createSlackInstallUrl } from "@/lib/actions/slack";
import { isPublicIdOfType } from "@/lib/db/public-id";
import { oauthRequestOrigin, oauthResultUrl } from "@/lib/integrations/oauth-url";
import { appPath, appRootPath } from "@/lib/routing/app-path";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const installQuerySchema = z.object({
  projectId: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .refine((value) => isPublicIdOfType(value, "prj")),
  returnPath: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((value) => value.startsWith("/") && !value.startsWith("//") && !value.includes("\\"))
    .optional(),
});

function resultUrl(request: NextRequest) {
  const url = oauthResultUrl(request.url, appRootPath());
  url.searchParams.set("slack", "error");
  return url;
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const query = installQuerySchema.parse({
      projectId: url.searchParams.get("projectId"),
      returnPath: url.searchParams.get("returnPath") ?? undefined,
    });
    const actor = await getActionActor();
    const project = await requireProjectScope(actor, "manage", query.projectId, {
      type: "slack_connection",
    });

    const installUrl = createSlackInstallUrl({
      actorId: actor.id,
      origin: oauthRequestOrigin(request.url),
      projectId: project.id,
      returnPath: query.returnPath ?? appPath(project.publicId, "alerts"),
    });

    const response = NextResponse.redirect(installUrl);
    // Bind the OAuth state to this browser so the callback can verify the flow (CSRF).
    response.cookies.set("slack_oauth_state", new URL(installUrl).searchParams.get("state") ?? "", {
      httpOnly: true,
      maxAge: 600,
      path: "/api/integrations/slack",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch {
    return NextResponse.redirect(resultUrl(request));
  }
}
