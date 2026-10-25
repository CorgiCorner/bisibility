import { prisma } from "@/lib/db/prisma";

export async function storedStripHistory(projectId: string, url: string, now = new Date()) {
  // Include an anchor before the window, even if the last transition was years ago.
  // Two extra days cover viewer time zones at either edge of the 90-day strip.
  const since = new Date(now.getTime() - 92 * 86400000);
  const [anchor, recent] = await Promise.all([
    prisma.urlPresenceChange.findFirst({
      where: { projectId, url, at: { lt: since } },
      orderBy: [{ at: "desc" }, { id: "desc" }],
      select: { at: true, previous: true, next: true },
    }),
    prisma.urlPresenceChange.findMany({
      where: { projectId, url, at: { gte: since, lte: now } },
      orderBy: [{ at: "asc" }, { id: "asc" }],
      select: { at: true, previous: true, next: true },
    }),
  ]);
  return [...(anchor ? [anchor] : []), ...recent];
}
