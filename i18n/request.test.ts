import { readFile } from "node:fs/promises";
import polishSharedMessages from "@/messages/core/pl/shared.json";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_TIME_ZONE } from "./formats";

vi.mock("next-intl/server", () => ({ getRequestConfig: (factory: unknown) => factory }));

import requestConfig, { createIntlRequestConfig } from "./request";

describe("next-intl request configuration", () => {
  it("falls back to the active default for an unknown request locale", async () => {
    const config = await requestConfig({ requestLocale: Promise.resolve("de") });

    expect(config.locale).toBe("en");
    expect(config.messages).toHaveProperty("shared.language.label", "Language");
    expect(config.timeZone).toBe(DEFAULT_TIME_ZONE);
  });

  it("serves an activated request locale from its own catalog", async () => {
    const config = await requestConfig({ requestLocale: Promise.resolve("pl") });

    expect(config.locale).toBe("pl");
    expect(config.messages).toHaveProperty(
      "shared.language.label",
      polishSharedMessages.shared.language.label,
    );
    expect(config.timeZone).toBe(DEFAULT_TIME_ZONE);
  });

  it("accepts an explicit locale and catalog without reading the registry", () => {
    const config = createIntlRequestConfig("es-ES", {
      shared: { language: { label: "Idioma" } },
    });

    expect(config.locale).toBe("es-ES");
    expect(config.messages).toHaveProperty("shared.language.label", "Idioma");
    expect(config.timeZone).toBe(DEFAULT_TIME_ZONE);
  });

  it("accepts the document root locale without reading request state itself", async () => {
    const source = await readFile(new URL("./request.ts", import.meta.url), "utf8");

    expect(source).not.toContain("next/headers");
    expect(source).not.toContain("getLocalePreference");
    expect(source).toContain("requestLocale");
    expect(source).toContain("setRequestLocale");
  });
});
