const ENGLISH_LOCALE = "en";

/**
 * Markets persist the English country and language names they were created with. A viewer in
 * another locale must see their own words, so the stored ISO code is resolved through
 * `Intl.DisplayNames` at render time. The persisted label stays the fallback: a code the
 * runtime does not know, or a label that was never the English display name (a city or a
 * custom location), is returned untouched.
 */
function localizedDisplayName(
  type: "language" | "region",
  code: string | null | undefined,
  label: string,
  locale: string,
): string {
  const normalized = type === "region" ? code?.trim().toUpperCase() : code?.trim();
  if (!normalized) return label;
  try {
    const english = new Intl.DisplayNames([ENGLISH_LOCALE], { type }).of(normalized);
    if (!english || english === normalized || label !== english) return label;
    return new Intl.DisplayNames([locale], { type }).of(normalized) ?? label;
  } catch {
    return label;
  }
}

export function regionDisplayName(
  code: string | null | undefined,
  label: string,
  locale: string,
): string {
  return localizedDisplayName("region", code, label, locale);
}

export function languageDisplayName(
  code: string | null | undefined,
  label: string,
  locale: string,
): string {
  return localizedDisplayName("language", code, label, locale);
}
