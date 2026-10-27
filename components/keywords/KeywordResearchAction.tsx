"use client";

import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { appPath } from "@/lib/routing/app-path";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function KeywordResearchAction({
  projectRef,
  selection,
}: Readonly<{
  projectRef: string;
  selection: { keyword: string; location: string } | null;
}>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.saved");
  const params = new URLSearchParams();
  if (selection) {
    params.set("seed", selection.keyword);
    params.set("location", selection.location);
  }
  const icon = <MagnifyingGlass weight="regular" size={15} />;
  return selection ? (
    <Tooltip content={t("researchTooltip")} semantics="description">
      <Button
        component={Link}
        href={`${appPath(projectRef, "keyword-research")}?${params}`}
        size="xs"
        startIcon={icon}
        variant="secondary"
      >
        {t("research")}
      </Button>
    </Tooltip>
  ) : (
    <Tooltip content={t("researchOneAtATime")} semantics="description">
      <Button
        aria-disabled="true"
        className="!pointer-events-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid"
        onClick={(event) => event.preventDefault()}
        size="xs"
        startIcon={icon}
        type="button"
        variant="secondary"
      >
        {t("research")}
      </Button>
    </Tooltip>
  );
}
