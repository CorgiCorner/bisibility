import { runInNewContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyTheme,
  initializeThemeFromCookie,
  normalizeThemePreference,
  readTheme,
  readThemePreference,
  resolveTheme,
  serverThemeMode,
  subscribeTheme,
  subscribeThemePreference,
  themeCookieStorageManager,
  themeInitScript,
} from "./browser-theme";

type MediaListener = (event: MediaQueryListEvent) => void;

function setThemeCookie(value: string) {
  // biome-ignore lint/suspicious/noDocumentCookie: jsdom cookie setup mirrors the browser contract.
  document.cookie = `theme=${value}; path=/`;
}

/** Stands in for the OS setting, which jsdom always reports as "light". */
function stubPrefersDark(initial: boolean) {
  const listeners = new Set<MediaListener>();
  const list = {
    matches: initial,
    addEventListener: (_: string, listener: MediaListener) => listeners.add(listener),
    removeEventListener: (_: string, listener: MediaListener) => listeners.delete(listener),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => list),
  );

  return {
    set(matches: boolean) {
      list.matches = matches;
      for (const listener of [...listeners]) {
        listener({ matches } as MediaQueryListEvent);
      }
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

describe("browser theme", () => {
  beforeEach(() => {
    // biome-ignore lint/suspicious/noDocumentCookie: jsdom cookie cleanup mirrors the browser contract.
    document.cookie = "theme=; path=/; max-age=0";
    document.documentElement.removeAttribute("data-theme");
    document.body.removeAttribute("data-theme");
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("initializes the document to dark before hydration", () => {
    setThemeCookie("dark");

    initializeThemeFromCookie();

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.body.dataset.theme).toBe("dark");
    expect(themeInitScript).toContain("document.documentElement.dataset.theme");
  });

  it("keeps the serialized pre-paint initializer self-contained", () => {
    setThemeCookie("dark");

    expect(() => runInNewContext(themeInitScript, { document })).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.body.dataset.theme).toBe("dark");
  });

  it("reaches the window without a build-time window check", () => {
    // The script is stringified from the server bundle, where the bundler folds
    // `typeof window` to "undefined" and would leave `system` stuck on light.
    expect(themeInitScript).not.toContain("typeof window");
    expect(themeInitScript).toContain("document.defaultView");
    expect(themeInitScript).toContain("prefers-color-scheme: dark");
    expect(themeInitScript).toContain('addEventListener("change"');
  });

  it("treats an unknown or missing cookie as the system preference", () => {
    setThemeCookie("sepia");

    expect(readThemePreference()).toBe("system");
    expect(normalizeThemePreference(undefined)).toBe("system");
    expect(normalizeThemePreference("dark")).toBe("dark");
  });

  it("paints the OS theme before hydration when the preference is system", () => {
    stubPrefersDark(true);
    setThemeCookie("system");

    initializeThemeFromCookie();

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.body.dataset.theme).toBe("dark");
  });

  it("keeps following the OS after the page has loaded", () => {
    const media = stubPrefersDark(false);
    setThemeCookie("system");
    document.body.innerHTML = '<div data-app-theme-root data-theme="light"></div>';
    initializeThemeFromCookie();
    const seen: string[] = [];
    const unsubscribe = subscribeTheme((theme) => seen.push(theme));

    media.set(true);

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.querySelector("[data-app-theme-root]")).toHaveAttribute("data-theme", "dark");
    expect(seen).toContain("dark");
    unsubscribe();
  });

  it("ignores the OS once an explicit theme is chosen", () => {
    const media = stubPrefersDark(false);
    setThemeCookie("dark");
    initializeThemeFromCookie();

    media.set(true);

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(readTheme()).toBe("dark");
  });

  it("resolves system against the OS but never stores a resolved value", () => {
    stubPrefersDark(true);

    expect(resolveTheme("system")).toBe("dark");
    expect(resolveTheme("light")).toBe("light");

    applyTheme("system");

    expect(document.cookie).toContain("theme=system");
    expect(readThemePreference()).toBe("system");
    expect(readTheme()).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("leaves the server without a resolved theme for system", () => {
    expect(serverThemeMode("system")).toBeUndefined();
    expect(serverThemeMode("dark")).toBe("dark");
  });

  it("releases the OS listener when a subscriber unsubscribes", () => {
    const media = stubPrefersDark(false);

    const unsubscribe = subscribeTheme(() => undefined);
    expect(media.listenerCount).toBe(1);

    unsubscribe();
    expect(media.listenerCount).toBe(0);
  });

  it("reads the pre-painted document theme before the marketing shell is themed", () => {
    setThemeCookie("dark");
    document.documentElement.dataset.theme = "dark";
    document.body.innerHTML = "<div data-app-theme-root></div>";

    expect(readTheme()).toBe("dark");
  });

  it("keeps the cookie authoritative when a stale shell is remounted", () => {
    setThemeCookie("dark");
    document.documentElement.dataset.theme = "dark";
    document.body.innerHTML = '<div data-app-theme-root data-theme="light"></div>';

    expect(readTheme()).toBe("dark");
  });

  it("notifies theme subscribers after applying a mode", () => {
    const themes: string[] = [];
    const unsubscribe = subscribeTheme((theme) => themes.push(theme));

    applyTheme("dark");
    unsubscribe();
    applyTheme("light");

    expect(themes).toEqual(["dark"]);
  });

  it("notifies preference subscribers with the stored choice, not the resolved one", () => {
    stubPrefersDark(true);
    const preferences: string[] = [];
    const unsubscribe = subscribeThemePreference((preference) => preferences.push(preference));

    applyTheme("system");
    unsubscribe();

    expect(preferences).toEqual(["system"]);
  });

  it("keeps MUI mode storage on the shared theme cookie", () => {
    setThemeCookie("dark");
    const storage = themeCookieStorageManager({ key: "theme", storageWindow: window });

    expect(storage.get("light")).toBe("dark");
    storage.set("light");

    expect(storage.get("dark")).toBe("light");
    expect(document.cookie).toContain("theme=light");

    storage.set("system");
    expect(storage.get("light")).toBe("system");
  });

  it("leaves MUI color-scheme storage keys at their defaults", () => {
    const storage = themeCookieStorageManager({
      key: "mui-color-scheme-dark",
      storageWindow: window,
    });

    expect(storage.get("dark")).toBe("dark");
    storage.set("light");
    expect(document.cookie).not.toContain("mui-color-scheme-dark");
  });
});
