import { unsubscribeAchievementEmail } from "@/lib/achievements/unsubscribe";
import { unsubscribeFromMarketingEmails } from "@/lib/email/marketing-unsubscribe";
import { unsubscribeNotificationEmail } from "@/lib/email/notification-unsubscribe";
import { validateOneClickForm } from "@/lib/http/one-click-form";
import { NextResponse } from "next/server";

function params(request: Request) {
  const search = new URL(request.url).searchParams;
  const stream = search.get("stream");
  const token = search.get("token");
  if (
    (stream !== "marketing" && stream !== "achievement" && stream !== "notification") ||
    !token ||
    token.length > 2000
  )
    return null;
  return { stream, token };
}

export function GET(request: Request) {
  const input = params(request);
  if (!input) return new Response(null, { status: 400 });
  if (input.stream === "notification") {
    const destination = new URL("/email/unsubscribe/notifications", request.url);
    destination.searchParams.set("token", input.token);
    return NextResponse.redirect(destination);
  }
  const path = input.stream === "marketing" ? "/email/unsubscribe" : "/activity/unsubscribe";
  const destination = new URL(path, request.url);
  destination.searchParams.set("token", input.token);
  return NextResponse.redirect(destination);
}

export async function POST(request: Request) {
  const input = params(request);
  if (!input) return new Response(null, { status: 400 });
  const formError = await validateOneClickForm(request);
  if (formError) return new Response(null, { status: formError });
  const accepted =
    input.stream === "marketing"
      ? await unsubscribeFromMarketingEmails(input.token)
      : input.stream === "achievement"
        ? await unsubscribeAchievementEmail(input.token)
        : await unsubscribeNotificationEmail(input.token);
  return new Response(null, { status: accepted ? 200 : 400 });
}
