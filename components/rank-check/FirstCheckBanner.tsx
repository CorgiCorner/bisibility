import { iconWellClassName } from "@/components/ui";
import { docsLinkProps } from "@/lib/site/site";
import {
  CaretRightIcon as CaretRight,
  PuzzlePieceIcon as PuzzlePiece,
  RankingIcon as Ranking,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactNode } from "react";

export type FirstCheckBannerIcon = "puzzle" | "ranking";

const bannerIcons = {
  puzzle: PuzzlePiece,
  ranking: Ranking,
} as const;

export function keywordReadinessSubject(keywordCount: number) {
  const count = Number.isFinite(keywordCount) ? Math.max(0, Math.floor(keywordCount)) : 0;
  if (count === 0) return "No keywords are";
  if (count === 1) return "1 keyword is";
  return `${count.toLocaleString("en-US")} keywords are`;
}

function defaultFirstCheckDetail(keywordCount: number) {
  if (keywordCount === 0) return "Add keywords to start rank tracking.";
  return `${keywordReadinessSubject(keywordCount)} ready for the first rank check.`;
}

export function FirstCheckBannerLink({ href, label }: Readonly<{ href: string; label: string }>) {
  return (
    <Link
      className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-accent-solid px-[13px] py-2 text-[12.5px] font-semibold text-accent-on-solid outline-none transition-colors hover:bg-accent-solid-hover focus-visible:bg-accent-solid-hover"
      href={href}
      {...docsLinkProps(href)}
    >
      {label}
      <CaretRight aria-hidden size={14} weight="bold" />
    </Link>
  );
}

export function FirstCheckBanner({
  action,
  detail,
  icon = "puzzle",
  keywordCount,
  title = "No rankings yet",
}: Readonly<{
  action?: ReactNode;
  detail?: string;
  icon?: FirstCheckBannerIcon;
  keywordCount?: number;
  title?: string;
}>) {
  const Glyph = bannerIcons[icon];
  const resolvedDetail = detail ?? defaultFirstCheckDetail(keywordCount ?? 0);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-accent bg-accent-soft px-4 py-[13px] text-fg sm:flex-row sm:items-center sm:gap-3">
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-[10px] ${iconWellClassName}`}
      >
        <Glyph
          aria-hidden
          data-icon={icon === "ranking" ? "ranking" : "puzzle-piece"}
          data-testid="first-check-banner-icon"
          data-weight="bold"
          size={19}
          weight="bold"
        />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="m-0 text-[13px] font-semibold leading-[1.5] text-fg">{title}</h2>
        <p className="m-0 mt-0.5 text-[13px] leading-[1.5] text-fg-muted">{resolvedDetail}</p>
      </div>
      {action}
    </section>
  );
}
