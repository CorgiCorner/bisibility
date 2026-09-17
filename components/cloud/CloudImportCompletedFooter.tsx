import { IdChip } from "@/components/ui/IdChip";
import { appPath } from "@/lib/routing/app-path";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import { LinkIcon } from "@phosphor-icons/react/dist/csr/Link";

export function CloudImportCompletedFooter({
  copyImportJobLabel,
  importJobId,
  importJobLabel,
  openProjectLabel,
  projectRef,
}: Readonly<{
  copyImportJobLabel: string;
  importJobId: string | null;
  importJobLabel: string;
  openProjectLabel: string;
  projectRef: string;
}>) {
  return (
    <div className="flex items-center gap-[9px] border-border border-t p-[14px_20px]">
      <LinkIcon aria-hidden className="flex-none text-fg-muted" size={15} weight="regular" />
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-[11.5px] text-fg-muted">
        {importJobLabel}
        {importJobId ? (
          <IdChip copyLabel={copyImportJobLabel} size="xs" value={importJobId} />
        ) : null}
      </span>
      <a
        className="inline-flex flex-none items-center gap-1.5 rounded-control bg-accent-solid px-3.5 py-2 font-semibold text-[12px] text-accent-on-solid"
        href={appPath(projectRef, "dashboard")}
      >
        {openProjectLabel}
        <CaretRight aria-hidden size={12} weight="regular" />
      </a>
    </div>
  );
}
