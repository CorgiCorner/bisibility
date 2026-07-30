import "server-only";

import { completeSlackOAuthInstall } from "@/lib/actions/slack";
import { oauthResultUrl } from "@/lib/integrations/oauth-url";
import { appRootPath } from "@/lib/routing/app-path";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function resultUrl(request: NextRequest, returnPath: string, status: "connected" | "error") {
  const url = oauthResultUrl(request.url, returnPath);
  url.searchParams.set("slack", status);
  return url;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const slackError = url.searchParams.get("error");
  if (slackError) {
    return NextResponse.redirect(resultUrl(request, appRootPath(), "error"));
  }

  try {
    const result = await completeSlackOAuthInstall({
      code: url.searchParams.get("code"),
      state: url.searchParams.get("state"),
    });
    const redirectUrl = resultUrl(request, result.returnPath, "connected");
    redirectUrl.searchParams.set("projectId", result.projectId);

    return NextResponse.redirect(redirectUrl);
  } catch {
    return NextResponse.redirect(resultUrl(request, appRootPath(), "error"));
  }
}
