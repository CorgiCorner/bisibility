import "server-only";

import { updateProfileNameRecord } from "@/lib/account/profile-service";
import { prisma } from "@/lib/db/prisma";
import type { PersonalApiContext } from "./context";
import { requireApiPublicId } from "./public-id";
import { resourceResponse } from "./responses";
import { mePatchSchema } from "./schemas";
import { objectBody, parseApiInput, readJsonBody } from "./surface";

async function meResource(
  userId: string,
  user: { email: string; name: string; publicId: string | null },
) {
  const memberships = await prisma.membership.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      project: { select: { domain: true, name: true, publicId: true } },
      role: true,
    },
    where: { userId },
  });

  return {
    email: user.email,
    id: requireApiPublicId(user.publicId ?? "", "usr"),
    name: user.name,
    projects: memberships.map((membership) => ({
      domain: membership.project.domain,
      id: requireApiPublicId(membership.project.publicId ?? "", "prj"),
      name: membership.project.name,
      role: membership.role,
    })),
  };
}

export async function getMe(ctx: PersonalApiContext) {
  return resourceResponse(await meResource(ctx.auth.user.id, ctx.auth.user), {
    headers: ctx.headers,
  });
}

export async function updateMe(ctx: PersonalApiContext) {
  const body = await readJsonBody(ctx);
  const data = parseApiInput(mePatchSchema, objectBody(body));
  const updated = await updateProfileNameRecord(ctx.auth.user.id, data.name);

  return resourceResponse(
    await meResource(ctx.auth.user.id, {
      email: ctx.auth.user.email,
      name: updated.name,
      publicId: ctx.auth.user.publicId,
    }),
    { headers: ctx.headers },
  );
}
