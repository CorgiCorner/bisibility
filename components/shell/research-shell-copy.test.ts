import messagesEn from "@/messages/core/en/shell.json";
import messagesEs from "@/messages/core/es-ES/shell.json";
import messagesJa from "@/messages/core/ja/shell.json";
import messagesPl from "@/messages/core/pl/shell.json";
import { createTranslator } from "use-intl/core";
import { describe, expect, it } from "vitest";
import { commandPaletteCopy } from "./command-palette-copy";
import { localizedHeaderMeta } from "./header-copy";

const locales = [
  { locale: "en", messages: messagesEn },
  { locale: "pl", messages: messagesPl },
  { locale: "es-ES", messages: messagesEs },
  { locale: "ja", messages: messagesJa },
] as const;

const sections = [
  {
    key: "aiVisibility",
    title: "AI Visibility",
    subtitle: "Brand mentions and citations from available provider observations.",
  },
  {
    key: "promptExplorer",
    title: "Prompt Explorer",
    subtitle: "Compare synthetic prompt tests across supported models.",
  },
  {
    key: "siteAudit",
    title: "Site Audit",
    subtitle: "Crawl your project site and inspect issues by URL.",
  },
  {
    key: "projectContext",
    title: "Project Context",
    subtitle: "Business, audience, products and goals for your agents.",
  },
  {
    key: "agentReports",
    title: "Agent Reports",
    subtitle: "Saved analyses shared with members of this project.",
  },
] as const;

describe.each(locales)("research shell copy in $locale", ({ locale, messages }) => {
  it.each(sections)("localizes the $title header without feature catalogs", (section) => {
    const translator = createTranslator({
      locale,
      messages,
      namespace: "shell.header",
    }) as Parameters<typeof localizedHeaderMeta>[0];
    const localized = localizedHeaderMeta(
      translator,
      { title: section.title, subtitle: section.subtitle },
      true,
    );
    expect(localized.title).toBe(messages.shell.header.titles[section.key]);
    expect(localized.subtitle).toBe(messages.shell.header.subtitles[section.key]);
    if (locale !== "en") {
      expect(localized.title).not.toBe(section.title);
      expect(localized.subtitle).not.toBe(section.subtitle);
    }
  });
  it("supplies all five command palette destinations", () => {
    const translator = createTranslator({
      locale,
      messages,
      namespace: "shell.commandPalette",
    }) as Parameters<typeof commandPaletteCopy>[0];
    const navigation = createTranslator({
      locale,
      messages,
      namespace: "shell.navigation",
    }) as Parameters<typeof commandPaletteCopy>[1];
    const copy = commandPaletteCopy(translator, navigation);
    for (const section of sections)
      expect(copy.navigation[section.title]).toBe(messages.shell.navigation.items[section.key]);
  });
});
