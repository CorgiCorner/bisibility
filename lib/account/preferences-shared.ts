// Shared schema + options for account preferences. Pure module (no "use server"/"use
// client") so the RSC page, the server action, and the client form all use one source.
// The User table has no preference columns yet, so these persist in cookies, the same
// lightweight approach as the theme cookie read in `app/app/layout.tsx`.

import { type LandingSegment, landingSegments, primaryNavEntries } from "@/lib/nav/nav-items";
import { z } from "zod";

export const themeValues = ["light", "dark", "system"] as const;
export const densityValues = ["compact", "standard", "comfortable"] as const;
// Landing values are the primary sidebar route segments, sourced from `lib/nav/nav-items.ts` so
// the preference options cannot drift from the rail.
export const landingValues = landingSegments;
export const dateFormatValues = ["iso", "eu", "long"] as const;

export const preferencesSchema = z.object({
  dateFormat: z.enum(dateFormatValues).default("iso"),
  density: z.enum(densityValues).default("standard"),
  landing: z.enum(landingValues).default("dashboard"),
  theme: z.enum(themeValues).default("system"),
});

export type UserPreferences = z.infer<typeof preferencesSchema>;

export const PREFERENCE_COOKIES = {
  dateFormat: "pref_date_format",
  density: "pref_density",
  landing: "pref_landing",
  // theme reuses the existing cookie set by ThemeSegments and read before paint.
  theme: "theme",
} as const;

// Legacy cookie values from the previous two-option preference, mapped onto the current route
// segments. `overview` was the old dashboard surface; `keywords` was the old rank tracker list.
const LANDING_MIGRATIONS: Readonly<Record<string, LandingSegment>> = {
  overview: "dashboard",
  keywords: "rank-tracker",
};

const DEFAULT_LANDING: LandingSegment = "dashboard";

/**
 * Resolves a raw landing cookie value to a valid route segment. Known legacy values are
 * migrated; anything else (unknown, missing, non-string) falls back to the dashboard default so
 * a stale or hand-edited cookie never breaks the redirect or the form.
 */
export function resolveLandingPreference(raw: unknown): LandingSegment {
  if (typeof raw === "string") {
    if ((landingSegments as readonly string[]).includes(raw)) {
      return raw as LandingSegment;
    }
    const migrated = LANDING_MIGRATIONS[raw];
    if (migrated) {
      return migrated;
    }
  }
  return DEFAULT_LANDING;
}

// Parse loosely: any missing/invalid field falls back to its schema default rather than
// throwing, so a stale or hand-edited cookie never breaks the page render.
export function parsePreferences(
  raw: Partial<Record<keyof UserPreferences, unknown>>,
): UserPreferences {
  return preferencesSchema.parse({
    dateFormat: pick(dateFormatValues, raw.dateFormat),
    density: pick(densityValues, raw.density),
    landing: resolveLandingPreference(raw.landing),
    theme: pick(themeValues, raw.theme),
  });
}

function pick<T extends readonly string[]>(allowed: T, value: unknown): T[number] | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T[number])
    : undefined;
}

export const themeOptions = [
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
  { label: "System", value: "system" },
] as const satisfies readonly { label: string; value: UserPreferences["theme"] }[];

export const densityOptions = [
  { label: "Compact", value: "compact" },
  { label: "Standard", value: "standard" },
  { label: "Comfortable", value: "comfortable" },
] as const satisfies readonly { label: string; value: UserPreferences["density"] }[];

export const landingOptions = primaryNavEntries.map((entry) => ({
  label: entry.label,
  value: entry.segment,
})) satisfies readonly { label: string; value: UserPreferences["landing"] }[];

export const dateFormatOptions = [
  { label: "2025-06-19 (ISO)", value: "iso" },
  { label: "19/06/2025", value: "eu" },
  { label: "Jun 19, 2025", value: "long" },
] as const satisfies readonly { label: string; value: UserPreferences["dateFormat"] }[];
