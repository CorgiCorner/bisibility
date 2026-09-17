"use client";

import { EmptyState } from "@/components/ui/EmptyState";
import { ModuleMark } from "@/components/ui/ModuleMark";
import { ClockCounterClockwiseIcon as ClockCounterClockwise } from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import { FileDashedIcon as FileDashed } from "@phosphor-icons/react/dist/csr/FileDashed";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function TimelineEmpty({
  backToFirstPageHref,
  filtered,
  outOfRange,
}: Readonly<{
  backToFirstPageHref: string;
  filtered: boolean;
  outOfRange: boolean;
}>) {
  const t = useTranslations("projectTimeline.feed");

  if (outOfRange) {
    return (
      <EmptyState
        action={
          <Link
            className="inline-flex min-h-9 items-center rounded-control border border-accent bg-accent-solid px-3 text-[12px] font-semibold text-accent-on-solid"
            href={backToFirstPageHref}
          >
            {t("backToPageOne")}
          </Link>
        }
        description={t("emptyPageDescription")}
        icon={<FileDashed weight="regular" aria-hidden size={24} />}
        title={t("emptyPageTitle")}
      />
    );
  }

  if (filtered) {
    return (
      <EmptyState
        description={t("emptyFilteredDescription")}
        icon={<MagnifyingGlass weight="regular" aria-hidden size={24} />}
        title={t("emptyFilteredTitle")}
      />
    );
  }

  return (
    <EmptyState
      description={t("emptyDescription")}
      mark={<ModuleMark bordered icon={ClockCounterClockwise} />}
      title={t("emptyTitle")}
    />
  );
}
