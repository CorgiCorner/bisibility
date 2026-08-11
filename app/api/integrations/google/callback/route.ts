import "server-only";

import {
  type GoogleOAuthFailure,
  googleDeniedFailure,
  googleOAuthFailureFrom,
  logGoogleOAuthFailure,
} from "@/lib/integrations/google-oauth-failure";
import { oauthResultUrl } from "@/lib/integrations/oauth-url";
import {
  completeGoogleOAuthInstall,
  googleOAuthReturnContextFromState,
} from "@/lib/providers/analytics/google-oauth";
import { appRootPath } from "@/lib/routing/app-path";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function resultUrl(
  request: NextRequest,
  returnPath: string,
  status: "connected" | "error" | "select",
) {
  const url = oauthResultUrl(request.url, returnPath);
  url.searchParams.set("google", status);
  return url;
}

function returnContextFromState(url: URL) {
  return googleOAuthReturnContextFromState(url.searchParams.get("state"));
}

/**
 * Every failed install leaves one server-side line and one classified redirect. The failure
 * carries its own context when the state was readable (an expired state still knows where the
 * user came from); otherwise we fall back to whatever the state param can still tell us.
 */
function errorResultUrl(request: NextRequest, url: URL, failure: GoogleOAuthFailure) {
  const context = returnContextFromState(url);
  const projectId = failure.projectId ?? context?.projectId ?? null;
  const provider = failure.provider ?? context?.provider ?? null;
  logGoogleOAuthFailure({
    googleError: failure.googleError,
    projectId,
    provider,
    reason: failure.reason,
  });

  const returnPath = failure.returnPath ?? context?.returnPath ?? appRootPath();
  const redirectUrl = resultUrl(request, returnPath, "error");
  if (provider) {
    redirectUrl.searchParams.set("connect", provider);
    redirectUrl.searchParams.set("provider", provider);
  }
  if (failure.reason) {
    redirectUrl.searchParams.set("reason", failure.reason);
  }
  return redirectUrl;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const googleError = url.searchParams.get("error");
  if (googleError) {
    return NextResponse.redirect(errorResultUrl(request, url, googleDeniedFailure(googleError)));
  }

  try {
    const result = await completeGoogleOAuthInstall({
      code: url.searchParams.get("code"),
      state: url.searchParams.get("state"),
    });
    const redirectUrl = resultUrl(request, result.returnPath, result.status);
    redirectUrl.searchParams.set("connect", result.provider);
    redirectUrl.searchParams.set("provider", result.provider);
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    return NextResponse.redirect(errorResultUrl(request, url, googleOAuthFailureFrom(error)));
  }
}
