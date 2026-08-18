import { unsubscribeFromMarketingEmails } from "@/lib/email/marketing-unsubscribe";
import { NextResponse } from "next/server";
import { z } from "zod";

const unsubscribeSchema = z.object({ token: z.string().min(1).max(2_000) });

export async function POST(request: Request) {
  const parsed = unsubscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const accepted = await unsubscribeFromMarketingEmails(parsed.data.token);
  return NextResponse.json({ ok: accepted }, { status: accepted ? 200 : 400 });
}
