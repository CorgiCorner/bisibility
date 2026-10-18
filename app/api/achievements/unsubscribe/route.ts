import { unsubscribeAchievementEmail } from "@/lib/achievements/unsubscribe";
import { readBodyWithLimit } from "@/lib/http/bounded-body";
import { z } from "zod";

const schema = z.object({ token: z.string().min(1).max(1000) });
export async function POST(request: Request) {
  const body = await readBodyWithLimit(request, 2048);
  if (!body.ok) return Response.json({ ok: false }, { status: 413 });
  let parsed: ReturnType<typeof schema.safeParse>;
  try {
    parsed = schema.safeParse(JSON.parse(body.bytes.toString("utf8")));
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  if (!parsed.success) return Response.json({ ok: false }, { status: 400 });
  const ok = await unsubscribeAchievementEmail(parsed.data.token);
  return Response.json(
    { ok },
    { status: ok ? 200 : 400, headers: { "Cache-Control": "no-store" } },
  );
}
