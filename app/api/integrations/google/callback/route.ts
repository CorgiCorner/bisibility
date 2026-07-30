import "server-only";

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

function errorResultUrl(request: NextRequest, url: URL) {
  const context = returnContextFromState(url);
  const redirectUrl = resultUrl(request, context?.returnPath ?? appRootPath(), "error");
  if (context) {
    redirectUrl.searchParams.set("connect", context.provider);
    redirectUrl.searchParams.set("provider", context.provider);
  }
  return redirectUrl;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  if (url.searchParams.get("error")) {
    return NextResponse.redirect(errorResultUrl(request, url));
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
  } catch {
    return NextResponse.redirect(errorResultUrl(request, url));
  }
}
