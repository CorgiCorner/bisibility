import type { StorageManager } from "@mui/system";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const THEME_COOKIE = "theme";
const THEME_CHANGE_EVENT = "themechange";

export type ThemeMode = "light" | "dark";
export type ThemeListener = (theme: ThemeMode) => void;

function themeFromCookie(cookie: string): ThemeMode {
  const value = cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${THEME_COOKIE}=`))
    ?.slice(THEME_COOKIE.length + 1);

  return value === "dark" ? "dark" : "light";
}

// This function is serialized into an inline pre-paint script below. Keep it
// self-contained: module-scope helpers and constants do not exist in that script.
export function initializeThemeFromCookie() {
  const value = document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("theme="))
    ?.slice("theme=".length);
  const mode = value === "dark" ? "dark" : "light";

  document.documentElement.dataset.theme = mode;
  document.body.dataset.theme = mode;
}

export const themeInitScript = `(${initializeThemeFromCookie.toString()})();`;

export function applyTheme(next: ThemeMode) {
  document.documentElement.dataset.theme = next;
  document.body.dataset.theme = next;
  const shellRoot = document.querySelector<HTMLElement>("[data-app-theme-root]");
  if (shellRoot) {
    shellRoot.dataset.theme = next;
  }
  // biome-ignore lint/suspicious/noDocumentCookie: theme changes must be synchronous.
  document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  window.dispatchEvent(new CustomEvent<ThemeMode>(THEME_CHANGE_EVENT, { detail: next }));
}

export function readTheme(): ThemeMode {
  return themeFromCookie(document.cookie);
}

export function subscribeTheme(listener: ThemeListener) {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  const handleThemeChange = (event: Event) => {
    listener((event as CustomEvent<ThemeMode>).detail);
  };
  window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
}

export const themeCookieStorageManager: StorageManager = ({ key }) => ({
  get(defaultValue) {
    if (key !== THEME_COOKIE || typeof document === "undefined") {
      return defaultValue;
    }
    return themeFromCookie(document.cookie);
  },
  set(value) {
    if (key === THEME_COOKIE && (value === "light" || value === "dark")) {
      // biome-ignore lint/suspicious/noDocumentCookie: MUI mode changes must be synchronous.
      document.cookie = `${THEME_COOKIE}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
    }
  },
  subscribe(handler) {
    return key === THEME_COOKIE ? subscribeTheme(handler) : () => undefined;
  },
});
