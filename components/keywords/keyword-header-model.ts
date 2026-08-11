export const metadataChipClassName =
  "rounded-full border border-border bg-bg-sunken px-2.5 py-1 text-[11px] font-medium text-fg";

export function deviceValue(value: string): "desktop" | "mobile" {
  return value.toLowerCase() === "mobile" ? "mobile" : "desktop";
}

export function deriveDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}
