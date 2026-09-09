import type { ExpectedUrlLogger } from "./types";

type Alternate = { href: string; language: string };

function attributes(value: string) {
  const values = new Map<string, string>();
  for (const match of value.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    const key = match[1]?.toLowerCase();
    const attribute = match[2] ?? match[3] ?? match[4];
    if (key && attribute) values.set(key, attribute);
  }
  return values;
}

function alternates(document: string): Alternate[] {
  const result: Alternate[] = [];
  for (const match of document.matchAll(/<(?:link|xhtml:link)\b([^>]*)>/gi)) {
    const value = attributes(match[1] ?? "");
    if (value.get("rel")?.toLowerCase() !== "alternate") continue;
    const href = value.get("href");
    const language = value.get("hreflang");
    if (href && language) result.push({ href, language: language.toLowerCase() });
  }
  return result;
}

function alternateLanguage(
  languageCode: string | null | undefined,
  countryCode: string | null | undefined,
) {
  const language = languageCode?.trim().toLowerCase();
  const country = countryCode?.trim().toUpperCase();
  return language && country ? `${language}-${country}`.toLowerCase() : null;
}

export function preferredHreflangAlternate(input: {
  allowedHosts: readonly string[];
  baseUrl: string;
  countryCode?: string | null;
  document: string;
  languageCode?: string | null;
  logger: ExpectedUrlLogger;
}) {
  const allowedHosts = new Set(input.allowedHosts.map((host) => host.toLowerCase()));
  const exact = alternateLanguage(input.languageCode, input.countryCode);
  const candidates = [exact, input.languageCode?.toLowerCase(), "x-default"].filter(
    (value): value is string => Boolean(value),
  );
  const options = alternates(input.document);
  for (const language of candidates) {
    const alternate = options.find((entry) => entry.language === language);
    if (!alternate) continue;
    try {
      const url = new URL(alternate.href, input.baseUrl);
      if (url.protocol !== "https:") {
        input.logger({ reason: "alternate_non_https", url: alternate.href });
        continue;
      }
      if (!allowedHosts.has(url.hostname.toLowerCase())) {
        input.logger({ reason: "alternate_host_not_allowed", url: url.toString() });
        continue;
      }
      return url.toString();
    } catch (error) {
      input.logger({
        error: error instanceof Error ? error.message : String(error),
        reason: "alternate_invalid_url",
      });
    }
  }
  return null;
}
