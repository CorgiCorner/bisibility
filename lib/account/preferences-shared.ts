// Shared schema + options for account preferences. Pure module (no "use server"/"use
// client") so the RSC page, the server action, and the client form all use one source.
// The User table has no preference columns yet, so these persist in cookies, the same
// lightweight approach as the theme cookie read in `app/app/layout.tsx`.

import { z } from "zod";

export const themeValues = ["light", "dark"] as const;
export const densityValues = ["compact", "standard", "comfortable"] as const;
export const landingValues = ["overview", "keywords"] as const;
export const dateFormatValues = ["iso", "eu", "long"] as const;

// Timezone + language are free-form selects; lift the timezone options from the mockup
// Settings (Europe/Warsaw · UTC · America/New_York) plus a few common zones.
export const timezoneValues = ["Europe/Warsaw", "UTC", "America/New_York"] as const;

export const languageValues = ["en", "pl", "de"] as const;

export const preferencesSchema = z.object({
  dateFormat: z.enum(dateFormatValues).default("iso"),
  density: z.enum(densityValues).default("standard"),
  landing: z.enum(landingValues).default("overview"),
  language: z.enum(languageValues).default("en"),
  theme: z.enum(themeValues).default("light"),
  timezone: z.enum(timezoneValues).default("Europe/Warsaw"),
});

export type UserPreferences = z.infer<typeof preferencesSchema>;

export const PREFERENCE_COOKIES = {
  dateFormat: "pref_date_format",
  density: "pref_density",
  landing: "pref_landing",
  language: "pref_language",
  // theme reuses the existing cookie set by ThemeToggle / read in app/app/layout.tsx.
  theme: "theme",
  timezone: "pref_timezone",
} as const;

// Parse loosely: any missing/invalid field falls back to its schema default rather than
// throwing, so a stale or hand-edited cookie never breaks the page render.
export function parsePreferences(
  raw: Partial<Record<keyof UserPreferences, unknown>>,
): UserPreferences {
  return preferencesSchema.parse({
    dateFormat: pick(dateFormatValues, raw.dateFormat),
    density: pick(densityValues, raw.density),
    landing: pick(landingValues, raw.landing),
    language: pick(languageValues, raw.language),
    theme: pick(themeValues, raw.theme),
    timezone: pick(timezoneValues, raw.timezone),
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
] as const satisfies readonly { label: string; value: UserPreferences["theme"] }[];

export const densityOptions = [
  { label: "Compact", value: "compact" },
  { label: "Standard", value: "standard" },
  { label: "Comfortable", value: "comfortable" },
] as const satisfies readonly { label: string; value: UserPreferences["density"] }[];

export const landingOptions = [
  { label: "Overview", value: "overview" },
  { label: "Keywords", value: "keywords" },
] as const satisfies readonly { label: string; value: UserPreferences["landing"] }[];

export const timezoneOptions = [
  { label: "Europe/Warsaw (UTC+1)", value: "Europe/Warsaw" },
  { label: "UTC", value: "UTC" },
  { label: "America/New_York", value: "America/New_York" },
] as const satisfies readonly { label: string; value: UserPreferences["timezone"] }[];

export const languageOptions = [
  { label: "English", value: "en" },
  { label: "Polski", value: "pl" },
  { label: "Deutsch", value: "de" },
] as const satisfies readonly { label: string; value: UserPreferences["language"] }[];

export const dateFormatOptions = [
  { label: "2025-06-19 (ISO)", value: "iso" },
  { label: "19/06/2025", value: "eu" },
  { label: "Jun 19, 2025", value: "long" },
] as const satisfies readonly { label: string; value: UserPreferences["dateFormat"] }[];
