import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resultCopyKeys } from "@/components/ai-research/model-playground-result-copy";
import { describe, expect, it } from "vitest";
import {
  flattenMessageCatalog,
  type MessageCatalog,
  mergeMessageCatalogs,
  messageSignature,
  validateCatalogParity,
} from "./catalog-contract";
import { sourceKeys } from "./model-playground-source-keys.test-support";

const locales = ["en", "es-ES", "ja", "pl"] as const;
const features = [
  "project-ai-research",
  "project-integrations",
  "project-ai-tracking",
  "research-history",
  "shared",
];
function catalog(locale: string): MessageCatalog {
  return mergeMessageCatalogs(
    ...features.map((feature) =>
      JSON.parse(readFileSync(resolve("messages/core", locale, `${feature}.json`), "utf8")),
    ),
  );
}
const english = catalog("en");
const englishMessages = flattenMessageCatalog(english);

describe("Model Playground locale contract", () => {
  const usedKeys = sourceKeys(
    ["components/ai-research", "components/integrations"],
    resultCopyKeys.map((key) => `projectAiResearch.modelPlayground.${key}`),
    Object.keys(english),
    (file) =>
      file.includes("/integrations/") ||
      /[Mm]odel[Pp]layground|model-playground/.test(readFileSync(file, "utf8")),
  ).filter((key) => Object.hasOwn(english, key.split(".")[0]));
  it("pins the inline usage dictionary to its catalog-backed caller", () => {
    const usage = readFileSync("components/integrations/UsageDetailsTable.tsx", "utf8");
    const caller = readFileSync("components/integrations/OwnUsageDetails.tsx", "utf8");
    expect(usage).toContain(
      "createTranslator({ locale, messages: { providerCount: m.providerCount } })",
    );
    expect(caller).toContain('providerCount: t.raw("providerCount")');
    expect(usedKeys).toContain("projectIntegrations.usageDetailsTable.providerCount");
  });
  it.each(locales)("contains every source-used key with English ICU parity in %s", (locale) => {
    const candidate = catalog(locale);
    const messages = flattenMessageCatalog(candidate);
    expect(usedKeys).toEqual(
      expect.arrayContaining([
        "projectAiResearch.modelPlayground.actualRoute",
        "projectAiResearch.modelPlayground.observedWorkspace",
        "projectAiResearch.modelPlayground.workspaceInvalid",
        "projectAiResearch.modelPlayground.allowedProviderSet",
        "projectIntegrations.billingSources.ownHelp",
      ]),
    );
    for (const key of usedKeys) {
      expect(englishMessages[key], `English source: ${key}`).toBeTypeOf("string");
      expect(messages[key], `${locale}: ${key}`).toBeTypeOf("string");
    }
    // The whole feature catalogs also cover computed/dynamic keys and future English additions.
    expect(validateCatalogParity(english, candidate)).toEqual([]);
  });

  it.each(locales)("uses the locale's token plural categories in %s", (locale) => {
    const message = flattenMessageCatalog(catalog(locale))[
      "projectAiResearch.modelPlayground.tokens"
    ];
    expect(messageSignature(message).pluralRules.get("count")).toEqual({
      offset: 0,
      type: "cardinal",
    });
    const categories = [...(messageSignature(message).pluralCategories.get("count") ?? [])];
    expect(categories).toEqual(
      expect.arrayContaining(new Intl.PluralRules(locale).resolvedOptions().pluralCategories),
    );
  });

  it("reads actual ICU plural categories rather than quoted option-like text", () => {
    expect([
      ...(messageSignature("{count, plural, other {'{one {' #}}").pluralCategories.get("count") ??
        []),
    ]).toEqual(["other"]);
  });
});
