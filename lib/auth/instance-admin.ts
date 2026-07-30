import "server-only";

import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { cache } from "react";

// cache() is active in React Server Components. The fallback keeps this helper
// importable in unit tests and other plain server contexts.
const perRequestCache: typeof cache = typeof cache === "function" ? cache : (fn) => fn;

export const getInstanceAdminSession = perRequestCache(async () => {
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    select: { isInstanceAdmin: true },
    where: { id: session.user.id },
  });

  return user?.isInstanceAdmin ? session : null;
});

export const requireInstanceAdmin = perRequestCache(async () => {
  const session = await getInstanceAdminSession();
  if (!session) notFound();

  return session;
});
