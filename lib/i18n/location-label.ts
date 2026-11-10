import { regionDisplayName } from "./display-names";

/** Provider hierarchies repeat the city/region. Keep the place and country for display only. */
export function compactLocationLabel(label: string): string {
  const parts = label
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 3) return label;
  const first = parts[0],
    last = parts[parts.length - 1];
  return first === last ? first : `${first}, ${last}`;
}

/** The full provider location remains the request identity, never the compact field text. */
export function localizedLocationLabel(
  location: { kind: "country" | "region" | "city"; displayName: string; countryCode: string },
  locale: string,
): string {
  if (location.kind === "country")
    return regionDisplayName(location.countryCode, location.displayName, locale);
  const place = location.displayName.split(",")[0].trim();
  if (!place) return location.displayName;
  try {
    const country = new Intl.DisplayNames([locale], { type: "region" }).of(location.countryCode);
    return country && country !== place ? `${place}, ${country}` : place;
  } catch {
    return compactLocationLabel(location.displayName);
  }
}
