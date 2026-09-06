import "server-only";

import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { headers } from "next/headers";
import { DATE_FORMAT_PREFERENCES, type DateFormat, type DateFormatPreference } from "./format";
import { resolveDateFormat } from "./resolve";

function isPreference(value: string): value is DateFormatPreference {
  return (DATE_FORMAT_PREFERENCES as readonly string[]).includes(value);
}

/**
 * Read the signed-in user's stored date format preference (defaults to auto).
 */
export async function getDateFormatPreference(): Promise<DateFormatPreference> {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    select: { dateFormat: true },
    where: { id: session.user.id },
  });
  const raw = user?.dateFormat ?? "auto";
  return isPreference(raw) ? raw : "auto";
}

/**
 * One server-side resolution per request: stored preference plus Accept-Language.
 */
export async function getResolvedDateFormat(): Promise<{
  preference: DateFormatPreference;
  resolved: DateFormat;
}> {
  const [preference, headerStore] = await Promise.all([getDateFormatPreference(), headers()]);
  const resolved = resolveDateFormat(preference, headerStore.get("accept-language"));
  return { preference, resolved };
}
