import { hasAsciiControlCharacters } from "@/lib/validation/control-characters";
export type IdentifierResult =
  | { ok: true; value: string }
  | { ok: false; reason: "invalid_identifier" | "unsafe_numeric_identifier" };

/** Numeric IDs are never repaired; callers must retain the original provider text. */
export function opaqueBusinessIdentifier(
  value: unknown,
  type: "cid" | "place_id",
): IdentifierResult {
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    return { ok: false, reason: "unsafe_numeric_identifier" };
  }
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 512 ||
    /\s/u.test(value) ||
    hasAsciiControlCharacters(value)
  ) {
    return { ok: false, reason: "invalid_identifier" };
  }
  if (type === "cid" && !/^[0-9]{1,128}$/.test(value))
    return { ok: false, reason: "invalid_identifier" };
  return { ok: true, value };
}

export function businessNameCandidateKey(value: string | null) {
  return value?.normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase() || null;
}

/** A website is only weak evidence; this never establishes branch identity. */
export function businessDomainCandidateKey(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port)
      return null;
    return url.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** Explicit Google Maps HTTPS hosts/paths only; no redirect or shortlink resolution. */
export function normalizeGoogleMapsUrl(value: string) {
  if (value !== value.trim() || hasAsciiControlCharacters(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    if (!["google.com", "www.google.com", "maps.google.com"].includes(url.hostname)) return null;
    const mapsPath = url.pathname === "/maps" || url.pathname.startsWith("/maps/");
    if (!mapsPath && !(url.hostname === "maps.google.com" && url.pathname === "/")) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Only supported explicit query IDs are extracted; data/ftid/path fragments are not guessed. */
export function identifiersFromMapsUrl(value: string) {
  const normalized = normalizeGoogleMapsUrl(value);
  if (!normalized) throw new Error("Unsupported Maps URL.");
  const url = new URL(normalized);
  const cid = url.searchParams.getAll("cid");
  const places = [
    ...url.searchParams.getAll("query_place_id"),
    ...url.searchParams.getAll("place_id"),
  ];
  for (const query of url.searchParams.getAll("q")) {
    if (query.startsWith("place_id:")) places.push(query.slice("place_id:".length));
  }
  const result: { type: "cid" | "place_id"; value: string }[] = [];
  for (const [type, values] of [
    ["cid", cid],
    ["place_id", places],
  ] as const) {
    if (new Set(values).size > 1) throw new Error("Conflicting Maps identifiers.");
    if (values.length) {
      const parsed = opaqueBusinessIdentifier(values[0], type);
      if (!parsed.ok) throw new Error("Invalid Maps identifier.");
      result.push({ type, value: parsed.value });
    }
  }
  return result;
}
