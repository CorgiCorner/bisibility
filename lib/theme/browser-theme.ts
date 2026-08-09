import type { StorageManager } from "@mui/system";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const THEME_COOKIE = "theme";
const THEME_CHANGE_EVENT = "themechange";
const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

/** What is painted on the document. `system` is never an applied value. */
export type ThemeMode = "light" | "dark";
/** What the user stored. `system` follows the OS and is the default. */
export type ThemePreference = ThemeMode | "system";
export type ThemeListener = (theme: ThemeMode) => void;
export type ThemePreferenceListener = (preference: ThemePreference) => void;

/** Anything that is not an explicit choice means "follow the OS". */
export function normalizeThemePreference(value: string | null | undefined): ThemePreference {
  return value === "dark" || value === "light" ? value : "system";
}

function preferenceFromCookie(cookie: string): ThemePreference {
  return normalizeThemePreference(
    cookie
      .split(";")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(`${THEME_COOKIE}=`))
      ?.slice(THEME_COOKIE.length + 1),
  );
}

function darkMedia(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(DARK_MEDIA_QUERY)
    : null;
}

/** Collapses a preference to the value the document can carry. */
export function resolveTheme(preference: ThemePreference): ThemeMode {
  if (preference !== "system") {
    return preference;
  }
  return darkMedia()?.matches ? "dark" : "light";
}

/**
 * The server cannot resolve `system` - only the browser knows the OS setting - so it
 * emits no theme at all and lets the pre-paint script own the first paint.
 */
export function serverThemeMode(preference: ThemePreference): ThemeMode | undefined {
  return preference === "system" ? undefined : preference;
}

// This function is serialized into an inline pre-paint script below. Keep it
// self-contained: module-scope helpers and constants do not exist in that script.
// It also owns the OS listener, so `system` keeps following the OS on every page
// without a mounted React subscriber.
//
// It reaches the window through `document.defaultView`, never through `window` or
// `typeof window`: the string is produced by the server bundle, where the bundler
// constant-folds `typeof window` to "undefined" and would silently disable the
// media query in the shipped script.
export function initializeThemeFromCookie() {
  const view = document.defaultView;
  const media =
    view && typeof view.matchMedia === "function"
      ? view.matchMedia("(prefers-color-scheme: dark)")
      : null;

  function paint() {
    const value = document.cookie
      .split(";")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith("theme="))
      ?.slice("theme=".length);
    const preference = value === "dark" || value === "light" ? value : "system";
    const mode = preference === "system" ? (media?.matches ? "dark" : "light") : preference;

    document.documentElement.dataset.theme = mode;
    if (document.body) {
      document.body.dataset.theme = mode;
    }
    const shellRoot = document.querySelector<HTMLElement>("[data-app-theme-root]");
    if (shellRoot) {
      shellRoot.dataset.theme = mode;
    }
    return preference;
  }

  paint();

  media?.addEventListener("change", () => {
    if (paint() === "system" && view) {
      view.dispatchEvent(new CustomEvent("themechange", { detail: "system" }));
    }
  });
}

export const themeInitScript = `(${initializeThemeFromCookie.toString()})();`;

export function applyTheme(next: ThemePreference) {
  const mode = resolveTheme(next);

  document.documentElement.dataset.theme = mode;
  document.body.dataset.theme = mode;
  const shellRoot = document.querySelector<HTMLElement>("[data-app-theme-root]");
  if (shellRoot) {
    shellRoot.dataset.theme = mode;
  }
  // biome-ignore lint/suspicious/noDocumentCookie: theme changes must be synchronous.
  document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  window.dispatchEvent(new CustomEvent<ThemePreference>(THEME_CHANGE_EVENT, { detail: next }));
}

/** The stored choice, including `system`. */
export function readThemePreference(): ThemePreference {
  return preferenceFromCookie(document.cookie);
}

/** The applied light/dark value the stored choice currently resolves to. */
export function readTheme(): ThemeMode {
  return resolveTheme(readThemePreference());
}

function subscribeThemeEvent(notify: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  window.addEventListener(THEME_CHANGE_EVENT, notify);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, notify);
}

export function subscribeTheme(listener: ThemeListener) {
  const notify = () => listener(readTheme());
  const unsubscribeEvent = subscribeThemeEvent(notify);
  // The OS can change the resolved theme without any theme event of ours.
  const media = darkMedia();
  media?.addEventListener("change", notify);

  return () => {
    unsubscribeEvent();
    media?.removeEventListener("change", notify);
  };
}

export function subscribeThemePreference(listener: ThemePreferenceListener) {
  // An OS change never changes the stored preference, so this only tracks our own event.
  return subscribeThemeEvent(() => listener(readThemePreference()));
}

export const themeCookieStorageManager: StorageManager = ({ key }) => ({
  get(defaultValue) {
    if (key !== THEME_COOKIE || typeof document === "undefined") {
      return defaultValue;
    }
    return preferenceFromCookie(document.cookie);
  },
  set(value) {
    if (key === THEME_COOKIE && (value === "light" || value === "dark" || value === "system")) {
      // biome-ignore lint/suspicious/noDocumentCookie: MUI mode changes must be synchronous.
      document.cookie = `${THEME_COOKIE}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
    }
  },
  subscribe(handler) {
    return key === THEME_COOKIE ? subscribeThemePreference(handler) : () => undefined;
  },
});
