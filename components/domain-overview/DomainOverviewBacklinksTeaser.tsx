import { Button } from "@/components/ui";
import { appPath } from "@/lib/routing/app-path";
import { ArrowRightIcon as ArrowRight, LinkIcon as LinkSimple } from "@phosphor-icons/react/ssr";
import Link from "next/link";

export function DomainOverviewBacklinksTeaser({
  projectRef,
  target,
}: Readonly<{ projectRef: string; target: string }>) {
  const params = new URLSearchParams({ target });
  return (
    <section className="flex flex-col items-start gap-3 rounded-[12px] border border-border bg-bg-elev px-[18px] py-4 sm:flex-row sm:items-center">
      <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[10px] bg-bg-sunken text-fg-muted">
        <LinkSimple aria-hidden size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="m-0 text-[14.5px] font-semibold">Backlinks</h3>
        <p className="m-0 mt-0.5 text-[12.5px] text-fg-muted">
          Referring domains, new and lost links, and history for {target}.
        </p>
      </div>
      <Button
        component={Link}
        endIcon={<ArrowRight size={13} weight="bold" />}
        href={`${appPath(projectRef, "backlinks")}?${params.toString()}`}
        size="sm"
        variant="secondary"
      >
        Analyze backlinks
      </Button>
    </section>
  );
}
