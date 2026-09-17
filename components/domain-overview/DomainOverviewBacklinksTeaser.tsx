import { Button } from "@/components/ui/Button";
import { appPath } from "@/lib/routing/app-path";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { LinkIcon as LinkSimple } from "@phosphor-icons/react/dist/ssr/Link";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function DomainOverviewBacklinksTeaser({
  projectRef,
  target,
}: Readonly<{ projectRef: string; target: string }>) {
  const t = useTranslations("projectDomainOverview.workspace.ui");
  const params = new URLSearchParams({ target });
  return (
    <section className="flex flex-col items-start gap-3 rounded-card border border-border bg-bg-elev px-4.5 py-4 sm:flex-row sm:items-center">
      <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-control bg-bg-sunken text-fg-muted">
        <LinkSimple weight="regular" aria-hidden size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="m-0 text-[14.5px] font-semibold">{t("backlinksTitle")}</h3>
        <p className="m-0 mt-0.5 text-[12.5px] text-fg-muted">
          {t("backlinksDescription", { target })}
        </p>
      </div>
      <Button
        component={Link}
        endIcon={<ArrowRight size={13} weight="regular" />}
        href={`${appPath(projectRef, "backlinks")}?${params.toString()}`}
        size="sm"
        variant="secondary"
      >
        {t("analyzeBacklinks")}
      </Button>
    </section>
  );
}
