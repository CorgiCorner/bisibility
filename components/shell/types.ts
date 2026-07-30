import type { ThemeMode } from "@/components/shell/set-theme";

export type ShellUser = {
  email?: string | null;
  name?: string | null;
  /** Current per-user theme, read server-side from the cookie. */
  theme?: ThemeMode;
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

export function shellUserInitials(user?: ShellUser) {
  const label = user?.name?.trim() || user?.email?.trim() || FALLBACK_NAME;
  const initials = label
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return (initials || "U").toUpperCase();
}

export function shellUserRoleLine(user?: ShellUser) {
  return user?.roleLine?.trim() || "";
}
