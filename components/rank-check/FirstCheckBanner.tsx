import { docsLinkProps } from "@/lib/site/site";
import {
  CaretRightIcon as CaretRight,
  ClockCountdownIcon as ClockCountdown,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactNode } from "react";

function keywordLabel(keywordCount: number) {
  const label = `${keywordCount.toLocaleString("en-US")} keyword${keywordCount === 1 ? "" : "s"}`;
  return `${label} ${keywordCount === 1 ? "is" : "are"}`;
}

export function FirstCheckBannerLink({ href, label }: Readonly<{ href: string; label: string }>) {
  return (
    <Link
      className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-accent-solid px-[13px] py-2 text-[12.5px] font-semibold text-primary-contrast outline-none transition-colors hover:bg-accent-solid-hover focus-visible:bg-accent-solid-hover"
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
  keywordCount,
}: Readonly<{ action?: ReactNode; keywordCount: number }>) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-accent bg-accent-soft px-4 py-[13px] text-fg sm:flex-row sm:items-center sm:gap-3">
      <ClockCountdown aria-hidden className="shrink-0 text-accent-text" size={17} weight="fill" />
      <p className="m-0 min-w-0 flex-1 text-[13px] leading-[1.5]">
        <strong className="font-semibold">No rankings yet.</strong>{" "}
        <span className="text-fg-muted">
          {keywordLabel(keywordCount)} ready for the first rank check.
        </span>
      </p>
      {action}
    </section>
  );
}
