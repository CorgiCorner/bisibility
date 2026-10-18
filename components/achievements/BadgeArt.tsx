import type { BadgeKind } from "@/lib/achievements/progress";
export function BadgeArt({ kind, locked = false }: { kind: BadgeKind; locked?: boolean }) {
  return (
    <svg
      aria-hidden
      className={`h-24 w-24 sm:h-28 sm:w-28 shrink-0 ${locked ? "opacity-65 saturate-50" : ""}`}
      viewBox={kind === "presence" ? "0 0 896 896" : "896 0 896 896"}
    >
      <image href="/achievements/badge-characters-clean.png" width="1792" height="896" />
    </svg>
  );
}
