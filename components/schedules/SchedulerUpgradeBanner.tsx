"use client";

import { PageContent } from "@/components/shell/PageContent";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Popup } from "@/components/ui/Popup";
import { Sheet } from "@/components/ui/Sheet";
import { appPath, asProjectRef, type ProjectRef } from "@/lib/routing/app-path";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/dist/csr/WarningCircle";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

export type SchedulerUpgradeIssue = { keywordId: string; keywordText: string };

const POPUP_ID = "scheduler-upgrade-keywords";

function AffectedKeywords({
  issues,
  onNavigate,
  projectRef,
}: Readonly<{
  issues: readonly SchedulerUpgradeIssue[];
  onNavigate: () => void;
  projectRef: ProjectRef;
}>) {
  return (
    <ul className="m-0 list-none p-0">
      {issues.map((issue) => (
        <li key={issue.keywordId}>
          <Link
            className="block min-h-9 truncate rounded-control px-3 py-[7px] text-[13px] text-fg hover:bg-bg-sunken focus-visible:bg-bg-sunken"
            href={appPath(projectRef, "rank-tracker", issue.keywordId)}
            onClick={onNavigate}
            title={issue.keywordText}
          >
            {issue.keywordText}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function SchedulerUpgradeBanner({
  issues,
  projectId,
}: Readonly<{ issues: readonly SchedulerUpgradeIssue[]; projectId: string }>) {
  const t = useTranslations("shared.schedulerUpgrade");
  const format = useFormatter();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState<"popup" | "sheet" | null>(null);
  if (!issues.length) return null;
  const projectRef = asProjectRef(projectId);
  const schedulesHref = projectSchedulesPath(projectRef);
  const title = t("title", { count: issues.length });
  const close = () => setOpen(null);
  const keywords = <AffectedKeywords issues={issues} onNavigate={close} projectRef={projectRef} />;

  return (
    // Same column as the page below it: project pages render inside the default PageContent.
    <PageContent className="mb-4">
      <section
        aria-label={title}
        className="@container relative flex min-h-11 items-center gap-2.5 rounded-card border border-border bg-bg-elev py-2 pr-2 pl-3 text-[12.5px] sm:min-h-10 sm:py-1 sm:pr-1"
      >
        <WarningCircle
          aria-hidden
          className="shrink-0 text-yellow-text"
          size={16}
          weight="regular"
        />
        <p className="m-0 min-w-0 flex-1 font-semibold text-fg sm:flex-initial">{title}</p>
        {/* The sentence is the part that gives way: it shows only when the row has room for it. */}
        <p
          className="m-0 hidden min-w-0 flex-1 truncate text-fg-muted @4xl:block"
          title={t("detail")}
        >
          {t("detailShort")}
        </p>
        <div className="hidden shrink-0 items-center gap-1 sm:ml-auto sm:flex">
          <Button
            aria-controls={open === "popup" ? POPUP_ID : undefined}
            aria-expanded={open === "popup"}
            aria-haspopup="dialog"
            className="aria-expanded:bg-[var(--button-secondary-bg)]"
            endIcon={<CaretDown aria-hidden size={12} weight="regular" />}
            onClick={() => setOpen("popup")}
            ref={setAnchorEl}
            size="xs"
            variant="ghost"
          >
            {t("reviewShort")}
          </Button>
          <Button component={Link} href={schedulesHref} size="xs" variant="secondary">
            {t("schedules")}
          </Button>
        </div>
        {/* Below sm the whole row is the target: the pseudo-element stretches over the section. */}
        <IconButton
          aria-haspopup="dialog"
          aria-label={t("review")}
          className="static -my-1 shrink-0 after:absolute after:inset-0 sm:hidden"
          onClick={() => setOpen("sheet")}
          size="small"
        >
          <CaretRight aria-hidden size={14} weight="regular" />
        </IconButton>
      </section>
      <Popup
        align="end"
        anchorEl={anchorEl}
        aria-label={t("affected")}
        contentProps={{ className: "mt-2 w-[340px] max-w-[calc(100vw-32px)]" }}
        id={POPUP_ID}
        onClose={close}
        open={open === "popup"}
      >
        <div className="flex items-center justify-between gap-2.5 border-b border-border px-4 py-[13px]">
          <span className="text-sm font-semibold">{t("affected")}</span>
          <span className="text-xs tabular-nums text-fg-muted">{format.number(issues.length)}</span>
        </div>
        <div className="max-h-[252px] overflow-y-auto p-1">{keywords}</div>
        <p className="m-0 border-t border-border px-4 py-2.5 text-xs text-fg-muted">
          {t("detail")}
        </p>
      </Popup>
      <Sheet
        footer={
          <Button component={Link} fullWidth href={schedulesHref} onClick={close}>
            {t("schedules")}
          </Button>
        }
        heightVariant="filters"
        onClose={close}
        open={open === "sheet"}
        title={title}
        widthVariant="filters"
      >
        <p className="m-0 text-[13px] text-fg-muted">{t("detail")}</p>
        <p className="mt-4.5 mb-1 border-b border-border pb-2 text-xs font-semibold text-fg-muted">
          {t("affected")}
        </p>
        <div className="-mx-3">{keywords}</div>
      </Sheet>
    </PageContent>
  );
}
