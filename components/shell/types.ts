import type { ThemePreference } from "@/components/shell/set-theme";

export type ShellUser = {
  /** Server-derived Gravatar URL for the user's email. */
  avatarUrl?: string | null;
  email?: string | null;
  name?: string | null;
  /** Stored theme preference, read server-side from the cookie. `system` follows the OS. */
  theme?: ThemePreference;
  /** Personal role line in the user menu header, e.g. "Owner in Acme". */
  roleLine?: string;
};

const FALLBACK_NAME = "Your account";

export function shellUserName(user?: ShellUser) {
  return user?.name?.trim() || user?.email?.trim() || FALLBACK_NAME;
}

export function shellUserEmail(user?: ShellUser) {
  return user?.email?.trim() || "";
}

export function shellUserRoleLine(user?: ShellUser) {
  return user?.roleLine?.trim() || "";
}
