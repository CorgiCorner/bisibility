import { readReachedProjectCapacity } from "@/lib/capacity/capacity-extension";
import "server-only";

import { readReachedProjectLimit } from "@/lib/api/resource-limits";
import { prisma } from "@/lib/db/prisma";
import { getQueryActor } from "./_auth";

/** The signed-in user's project limit once they own that many projects, else `null`. */
export async function readActorReachedProjectLimit(): Promise<number | null> {
  const actor = await getQueryActor();
  const catalog = await readReachedProjectCapacity(actor.id);
  return catalog === undefined ? readReachedProjectLimit(prisma, actor.id) : catalog;
}
