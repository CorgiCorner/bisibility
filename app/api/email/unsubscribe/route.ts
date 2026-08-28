import { unsubscribeFromMarketingEmails } from "@/lib/email/marketing-unsubscribe";
import { readBodyWithLimit } from "@/lib/http/bounded-body";
import { NextResponse } from "next/server";
import { z } from "zod";

const unsubscribeSchema = z.object({ token: z.string().min(1).max(2_000) });

function parseJson(bytes: Buffer) {
  try {
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const read = await readBodyWithLimit(request, 4096);
  if (!read.ok) {
    switch (read.reason) {
      case "too_large":
        return NextResponse.json({ ok: false }, { status: 413 });
      case "unreadable":
        return NextResponse.json({ ok: false }, { status: 400 });
    }
  }

  const parsed = unsubscribeSchema.safeParse(parseJson(read.bytes));
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const accepted = await unsubscribeFromMarketingEmails(parsed.data.token);
  return NextResponse.json({ ok: accepted }, { status: accepted ? 200 : 400 });
}
