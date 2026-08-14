import { countrySeed, type ResolvedLocation } from "./location";

export function denormalizedLocationLabel(
  location: Pick<
    ResolvedLocation,
    "countryCode" | "displayName" | "languageCode" | "languageLabel"
  >,
): string {
  const defaultLanguage = countrySeed(location.countryCode)?.languageCode;
  return location.languageCode === defaultLanguage
    ? location.displayName
    : `${location.displayName} (${location.languageLabel})`;
}
