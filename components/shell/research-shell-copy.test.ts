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
    key: "promptResearch",
    title: "Prompt Research",
    subtitle: "Research dataset questions by keyword. ChatGPT · US English.",
  },
  {
    key: "aiTracking",
    title: "Prompt Tracker",
    subtitle: "Monitor AI answers, brand mentions and cited sources over time.",
  },
  {
    key: "aiVisibility",
    title: "Brand Visibility",
    subtitle: "Brand mentions and citations from available provider observations.",
  },
  {
    key: "promptExplorer",
    title: "Model Playground",
    subtitle: "One question, several models. Compare who they name and which pages they cite.",
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
    title: "Reports",
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
  it("supplies command palette destinations", () => {
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
    for (const section of sections) {
      if (section.title === "Brand Visibility") continue;
      expect(copy.navigation[section.title]).toBe(messages.shell.navigation.items[section.key]);
    }
    expect(copy.navigation["Brand Visibility"]).toBeUndefined();
    expect(copy.navigation["AI Visibility"]).toBe(
      messages.shell.navigation.items.aiVisibilityModule,
    );
    expect(copy.navigationKeywords?.["AI Visibility"]).toEqual([
      messages.shell.navigation.keywords.aiVisibilityModule.geo,
      messages.shell.navigation.keywords.aiVisibilityModule.aeo,
      messages.shell.navigation.keywords.aiVisibilityModule.llm,
      messages.shell.navigation.keywords.aiVisibilityModule.llmo,
      messages.shell.navigation.keywords.aiVisibilityModule.chatgpt,
      messages.shell.navigation.keywords.aiVisibilityModule.aiSearch,
      messages.shell.navigation.keywords.aiVisibilityModule.promptTracker,
      messages.shell.navigation.keywords.aiVisibilityModule.promptResearch,
      messages.shell.navigation.keywords.aiVisibilityModule.brandVisibility,
    ]);
  });
});
