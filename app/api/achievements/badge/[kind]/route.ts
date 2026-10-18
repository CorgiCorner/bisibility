import { badgeImage } from "@/lib/achievements/image";
import { readAchievements } from "@/lib/achievements/read";
import { requireSession } from "@/lib/auth/session";
export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const session = await requireSession(),
    { kind } = await params;
  if (kind !== "presence" && kind !== "practice") return new Response(null, { status: 404 });
  const view = await readAchievements(session.user.id),
    award = view?.awards.find((a) => a.kind === kind);
  if (!award) return new Response(null, { status: 404 });
  return badgeImage(kind, award.earnedDay, true);
}
