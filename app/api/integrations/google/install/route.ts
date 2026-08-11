import "server-only";

import { getActionActor, requireProjectScope } from "@/lib/actions/_shared";
import { isPublicIdOfType } from "@/lib/db/public-id";
import { oauthRequestOrigin, oauthResultUrl } from "@/lib/integrations/oauth-url";
import {
  createGoogleInstallUrl,
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_STATE_TTL_MS,
  reusableGoogleInstallUrl,
} from "@/lib/providers/analytics/google-oauth";
import { appPath, appRootPath } from "@/lib/routing/app-path";
import { cookies } from "next/headers";
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
  property: z.string().trim().max(300).optional(),
  provider: z.enum(["gsc", "ga4"]),
  returnPath: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((value) => value.startsWith("/") && !value.startsWith("//") && !value.includes("\\"))
    .optional(),
});

function errorUrl(request: NextRequest) {
  const url = oauthResultUrl(request.url, appRootPath());
  url.searchParams.set("google", "error");
  return url;
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const query = installQuerySchema.parse({
      projectId: url.searchParams.get("projectId"),
      property: url.searchParams.get("property") ?? undefined,
      provider: url.searchParams.get("provider"),
      returnPath: url.searchParams.get("returnPath") ?? undefined,
    });
    const actor = await getActionActor();
    const project = await requireProjectScope(actor, "manage", query.projectId, {
      type: "provider_connection",
    });

    const install = {
      actorId: actor.id,
      origin: oauthRequestOrigin(request.url),
      projectId: project.publicId,
      property: query.property,
      provider: query.provider,
      returnPath: query.returnPath ?? appPath(project.publicId, "integrations"),
    };

    // A prefetch or a second click during consent must not invalidate the flow already in
    // flight, so an identical install with a live state cookie reuses that state and leaves
    // the cookie (and its original expiry) untouched.
    const cookieStore = await cookies();
    const reusedUrl = reusableGoogleInstallUrl({
      ...install,
      state: cookieStore.get(GOOGLE_OAUTH_STATE_COOKIE)?.value ?? null,
    });
    if (reusedUrl) {
      return NextResponse.redirect(reusedUrl);
    }

    const installUrl = createGoogleInstallUrl(install);
    const response = NextResponse.redirect(installUrl);
    // Bind the OAuth state to this browser so the callback can verify the flow (CSRF).
    response.cookies.set(
      GOOGLE_OAUTH_STATE_COOKIE,
      new URL(installUrl).searchParams.get("state") ?? "",
      {
        httpOnly: true,
        maxAge: Math.floor(GOOGLE_OAUTH_STATE_TTL_MS / 1000),
        path: "/api/integrations/google",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    );
    return response;
  } catch {
    return NextResponse.redirect(errorUrl(request));
  }
}
