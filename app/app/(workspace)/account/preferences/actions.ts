"use server";

import {
  PREFERENCE_COOKIES,
  preferencesSchema,
  type UserPreferences,
} from "@/lib/account/preferences-shared";
import { writeAudit } from "@/lib/auth/audit";
import { requireMutableAccountSession as requireSession } from "@/lib/demo/mutable-account-session";
import { persistDateFormatPreference } from "@/lib/queries/account";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Client input is revalidated server-side before any preference is written.
 * Date format persists on the user row; the other three stay in cookies for now.
 */
export async function updatePreferences(input: unknown): Promise<UserPreferences> {
  const session = await requireSession();
  const prefs = preferencesSchema.parse(input);

  const dateFormatResult = await persistDateFormatPreference(session.user.id, prefs.dateFormat);
  if (dateFormatResult.changed) {
    await writeAudit({
      action: "user.date_format.update",
      actorId: session.user.id,
      after: { dateFormat: prefs.dateFormat },
      before: { dateFormat: dateFormatResult.previousFormat },
      targetId: dateFormatResult.publicId,
      targetType: "user",
    });
  }

  const store = await cookies();
  const write = (name: string, value: string) =>
    store.set(name, value, { maxAge: COOKIE_MAX_AGE, path: "/", sameSite: "lax" });

  write(PREFERENCE_COOKIES.theme, prefs.theme);
  write(PREFERENCE_COOKIES.density, prefs.density);
  write(PREFERENCE_COOKIES.landing, prefs.landing);
  store.delete(PREFERENCE_COOKIES.dateFormat);
  store.delete("pref_timezone");
  store.delete("pref_language");

  revalidatePath("/app/account/preferences");
  return prefs;
}
