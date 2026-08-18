import { readFileSync } from "node:fs";
import { join } from "node:path";

export function checkMarketsContract(root, docsRoot) {
  const failures = [];

  function markedSection(source, start, end, label) {
    const startIndex = source.indexOf(start);
    const endIndex = source.indexOf(end);
    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
      failures.push(`markets.mdx is missing the ${label} catalog markers.`);
      return "";
    }
    return source.slice(startIndex + start.length, endIndex);
  }

  const marketsDocs = readFileSync(join(docsRoot, "markets.mdx"), "utf8");
  const marketsSource = readFileSync(join(root, "lib/serp/markets.ts"), "utf8");
  const languageCatalogSource = readFileSync(
    join(root, "lib/serp/generated/serp-language-catalog.ts"),
    "utf8",
  );
  const languageCatalog = [...languageCatalogSource.matchAll(/\{ code: "([^"]+)", label: "([^"]+)" \}/g)].map(
    ([, code, label]) => ({ code, label }),
  );
  const languageLabels = new Map(languageCatalog.map(({ code, label }) => [code, label]));
  const expectedMarkets = [
    ...marketsSource.matchAll(/market\("([^"]+)", "([a-z]{2})", "([^"]+)"/g),
  ].map(([, country, countryCode, languageCode]) => ({
    country,
    countryCode: countryCode.toUpperCase(),
    languageCode,
    languageLabel: languageLabels.get(languageCode),
  }));
  const marketSection = markedSection(
    marketsDocs,
    "{/* supported-market-catalog:start */}",
    "{/* supported-market-catalog:end */}",
    "supported market",
  );
  const documentedMarkets = [
    ...marketSection.matchAll(
      /^\| ([^|]+) \| `([A-Z]{2})` \| ([^(|]+) \(`([^`]+)`\) \|$/gm,
    ),
  ].map(([, country, countryCode, languageLabel, languageCode]) => ({
    country: country.trim(),
    countryCode,
    languageCode,
    languageLabel: languageLabel.trim(),
  }));
  if (JSON.stringify(documentedMarkets) !== JSON.stringify(expectedMarkets)) {
    failures.push("markets.mdx supported countries and defaults do not match lib/serp/markets.ts.");
  }

  const languageSection = markedSection(
    marketsDocs,
    "{/* supported-language-catalog:start */}",
    "{/* supported-language-catalog:end */}",
    "supported language",
  );
  const documentedLanguages = [
    ...languageSection.matchAll(/([^·\n]+?) \(`([^`]+)`\)(?: \u00b7|$)/gm),
  ].map(([, label, code]) => ({ code, label: label.trim() }));
  if (JSON.stringify(documentedLanguages) !== JSON.stringify(languageCatalog)) {
    failures.push(
      "markets.mdx supported languages do not match the generated SERP language catalog.",
    );
  }

  const marketsDocumentationContract = {
    "api/checks.mdx": ["location-language market", "`location_key`"],
    "api/competitors.mdx": ["location and language pair", "`ES@en`"],
    "api/keyword-research.mdx": [
      "country scope",
      "`keyword_overview`",
      "entire metrics bundle",
      "does not substitute another country's data",
    ],
    "api/keywords.mdx": ["optional `@language` qualifier", "`language_code`", "`language_label`"],
    "guides/competitors.mdx": ["location, language, and device", "Spain in English"],
    "markets.mdx": [
      "A market is a location and language pair",
      "Suggestions are a convenience",
      "shows Research metrics as `n/a`",
      "all-or-nothing",
    ],
  };
  for (const [page, requiredTerms] of Object.entries(marketsDocumentationContract)) {
    const source = readFileSync(join(docsRoot, page), "utf8");
    for (const term of requiredTerms) {
      if (!source.includes(term)) {
        failures.push(`${page} is missing the markets contract: ${term}`);
      }
    }
  }

  return failures;
}
