import { quietChipVariants } from "@/components/ui";
import { cn } from "@/lib/ui/cn";

export const metadataChipClassName = cn(quietChipVariants({ size: "lg" }), "text-fg");

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
