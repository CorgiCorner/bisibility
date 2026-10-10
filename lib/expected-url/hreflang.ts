import { type DefaultTreeAdapterMap, parse } from "parse5";
import type { ExpectedUrlLogger } from "./types";

type Alternate = { href: string; language: string };

function alternates(document: string): Alternate[] {
  const result: Alternate[] = [];
  const queue: DefaultTreeAdapterMap["node"][] = [parse(document)];
  while (queue.length) {
    const node = queue.pop();
    if (!node) break;
    if ("tagName" in node && ["link", "xhtml:link"].includes(node.tagName)) {
      const attributes = new Map(node.attrs.map(({ name, value }) => [name, value]));
      const href = attributes.get("href");
      const language = attributes.get("hreflang");
      if (
        attributes.get("rel")?.toLowerCase().split(/\s+/).includes("alternate") &&
        href &&
        language
      ) {
        result.push({ href, language: language.toLowerCase() });
      }
    }
    if ("childNodes" in node) {
      for (let index = node.childNodes.length - 1; index >= 0; index--)
        queue.push(node.childNodes[index]);
    }
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
      if (url.protocol !== "https:" || url.username || url.password) {
        input.logger({ reason: "alternate_non_https" });
        continue;
      }
      if (!allowedHosts.has(url.hostname.toLowerCase())) {
        input.logger({ reason: "alternate_host_not_allowed" });
        continue;
      }
      return url.toString();
    } catch {
      input.logger({ reason: "alternate_invalid_url" });
    }
  }
  return null;
}
