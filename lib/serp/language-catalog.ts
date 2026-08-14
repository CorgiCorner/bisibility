import { serpLanguageCatalog } from "./generated/serp-language-catalog";

export type SerpLanguage = {
  code: string;
  label: string;
};

const languageByCode = new Map<string, SerpLanguage>(
  serpLanguageCatalog.map((language) => [language.code, language]),
);

export function normalizeSerpLanguageCode(value: string): string | null {
  const code = value.trim().toLowerCase();
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(code) ? code : null;
}

export function resolveSerpLanguage(value: string): SerpLanguage | null {
  const code = normalizeSerpLanguageCode(value);
  return code ? (languageByCode.get(code) ?? null) : null;
}
