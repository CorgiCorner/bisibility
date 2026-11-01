import { unsubscribeAchievementEmail } from "@/lib/achievements/unsubscribe";
import { unsubscribeFromMarketingEmails } from "@/lib/email/marketing-unsubscribe";
import { unsubscribeNotificationEmail } from "@/lib/email/notification-unsubscribe";
import { readBodyWithLimit } from "@/lib/http/bounded-body";
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
  if (
    !input ||
    request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !==
      "application/x-www-form-urlencoded"
  )
    return new Response(null, { status: 400 });
  const body = await readBodyWithLimit(request, 4096);
  if (!body.ok) return new Response(null, { status: body.reason === "too_large" ? 413 : 400 });
  const form = new URLSearchParams(body.bytes.toString("utf8"));
  if (form.getAll("List-Unsubscribe").length !== 1 || form.get("List-Unsubscribe") !== "One-Click")
    return new Response(null, { status: 400 });
  const accepted =
    input.stream === "marketing"
      ? await unsubscribeFromMarketingEmails(input.token)
      : input.stream === "achievement"
        ? await unsubscribeAchievementEmail(input.token)
        : await unsubscribeNotificationEmail(input.token);
  return new Response(null, { status: accepted ? 200 : 400 });
}
