import { iconWellClassName } from "@/components/ui/icon-well-styles";
import { docsLinkProps } from "@/lib/site/site";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { PuzzlePieceIcon as PuzzlePiece } from "@phosphor-icons/react/dist/ssr/PuzzlePiece";
import { RankingIcon as Ranking } from "@phosphor-icons/react/dist/ssr/Ranking";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

export type FirstCheckBannerIcon = "puzzle" | "ranking";

const bannerIcons = {
  puzzle: PuzzlePiece,
  ranking: Ranking,
} as const;

export function FirstCheckBannerLink({ href, label }: Readonly<{ href: string; label: string }>) {
  return (
    <Link
      className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-control border border-border-control bg-bg-elev px-[13px] py-2 text-[12.5px] font-normal text-fg outline-none transition-colors hover:border-accent hover:bg-bg-sunken focus-visible:border-accent"
      href={href}
      {...docsLinkProps(href)}
    >
      {label}
      <CaretRight aria-hidden size={14} weight="regular" />
    </Link>
  );
}

export function FirstCheckBanner({
  action,
  detail,
  icon = "puzzle",
  keywordCount,
  title,
}: Readonly<{
  action?: ReactNode;
  detail?: string;
  icon?: FirstCheckBannerIcon;
  keywordCount?: number;
  title?: string;
}>) {
  const t = useTranslations("projectRankTracker.list.notices");
  const Glyph = bannerIcons[icon];
  const count = Number.isFinite(keywordCount) ? Math.max(0, Math.floor(keywordCount ?? 0)) : 0;
  const resolvedDetail = detail ?? t("firstCheckDetail", { count });
  const resolvedTitle = title ?? t("firstCheckTitle");

  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-bg-elev px-4 py-[13px] text-fg sm:flex-row sm:items-center sm:gap-3">
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-control ${iconWellClassName}`}
      >
        <Glyph
          aria-hidden
          data-icon={icon === "ranking" ? "ranking" : "puzzle-piece"}
          data-testid="first-check-banner-icon"
          data-weight="regular"
          size={19}
          weight="regular"
        />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="m-0 text-[13px] font-semibold leading-[1.5] text-fg">{resolvedTitle}</h2>
        <p className="m-0 mt-0.5 text-[13px] leading-[1.5] text-fg-muted">{resolvedDetail}</p>
      </div>
      {action}
    </section>
  );
}
