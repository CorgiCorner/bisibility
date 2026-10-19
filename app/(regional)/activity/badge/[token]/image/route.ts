import { badgeImage } from "@/lib/achievements/image";
import { readPublicAchievement } from "@/lib/achievements/sharing";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const award = await readPublicAchievement((await params).token);
  if (!award) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  return badgeImage(award.kind, award.earnedDay);
}
