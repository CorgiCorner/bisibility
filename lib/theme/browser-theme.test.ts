import { runInNewContext } from "node:vm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyTheme,
  initializeThemeFromCookie,
  readTheme,
  subscribeTheme,
  themeCookieStorageManager,
  themeInitScript,
} from "./browser-theme";

function setThemeCookie(value: "light" | "dark") {
  // biome-ignore lint/suspicious/noDocumentCookie: jsdom cookie setup mirrors the browser contract.
  document.cookie = `theme=${value}; path=/`;
}

describe("browser theme", () => {
  beforeEach(() => {
    // biome-ignore lint/suspicious/noDocumentCookie: jsdom cookie cleanup mirrors the browser contract.
    document.cookie = "theme=; path=/; max-age=0";
    document.documentElement.removeAttribute("data-theme");
    document.body.removeAttribute("data-theme");
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

  it("defaults the document to light without a valid cookie", () => {
    // biome-ignore lint/suspicious/noDocumentCookie: jsdom cookie setup mirrors the browser contract.
    document.cookie = "theme=system; path=/";

    initializeThemeFromCookie();

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.body.dataset.theme).toBe("light");
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

  it("keeps MUI mode storage on the shared theme cookie", () => {
    setThemeCookie("dark");
    const storage = themeCookieStorageManager({ key: "theme", storageWindow: window });

    expect(storage.get("light")).toBe("dark");
    storage.set("light");

    expect(storage.get("dark")).toBe("light");
    expect(document.cookie).toContain("theme=light");
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
