"use server";

import {
  PREFERENCE_COOKIES,
  preferencesSchema,
  type UserPreferences,
} from "@/lib/account/preferences-shared";
import { requireSession } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Client input is revalidated server-side before any preference cookie is written.
 */
export async function updatePreferences(input: unknown): Promise<UserPreferences> {
  await requireSession();
  const prefs = preferencesSchema.parse(input);

  const store = await cookies();
  const write = (name: string, value: string) =>
    store.set(name, value, { maxAge: COOKIE_MAX_AGE, path: "/", sameSite: "lax" });

  write(PREFERENCE_COOKIES.theme, prefs.theme);
  write(PREFERENCE_COOKIES.timezone, prefs.timezone);
  write(PREFERENCE_COOKIES.language, prefs.language);
  write(PREFERENCE_COOKIES.dateFormat, prefs.dateFormat);
  write(PREFERENCE_COOKIES.density, prefs.density);
  write(PREFERENCE_COOKIES.landing, prefs.landing);

  revalidatePath("/app/account/preferences");
  return prefs;
}
