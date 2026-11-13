import {
  settingsSearchEntries,
  settingsSearchHref,
} from "@/components/settings/shell/settings-search-index";
import type { SettingsShellTranslations } from "@/components/settings/shell/settings-sections";
import { describe, expect, it } from "vitest";

describe("settings search tags entry", () => {
  it("opens the tags section without the old General anchor", () => {
    const entry = settingsSearchEntries.find((candidate) => candidate.path === "settings/tags");
    expect(entry).toBeDefined();
    expect(entry?.anchor).toBeUndefined();
    expect(settingsSearchEntries.some((candidate) => candidate.anchor === "tags-segments")).toBe(
      false,
    );
    if (!entry) return;
    expect(settingsSearchHref("prj_1", entry)).toBe("/app/prj_1/settings/tags");
    const translate = ((key: string) => key) as unknown as SettingsShellTranslations;
    expect(entry.section(translate)).toBe("sections.tags");
  });

  it("opens the conversions section", () => {
    const entry = settingsSearchEntries.find(
      (candidate) => candidate.path === "settings/conversions",
    );
    expect(entry).toBeDefined();
    if (!entry) return;
    expect(settingsSearchHref("prj_1", entry)).toBe("/app/prj_1/settings/conversions");
    const translate = ((key: string) => key) as unknown as SettingsShellTranslations;
    expect(entry.label(translate)).toBe("search.entries.conversions.label");
    expect(entry.section(translate)).toBe("sections.conversions");
  });
});
