"use client";

import { MarketLabel } from "@/components/schedules/MarketLabel";
import { Menu } from "@/components/ui/Menu";
import { MenuItem } from "@/components/ui/MenuItem";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import { type ScheduleReference, scheduleRowState } from "@/lib/schedules/mixed-state";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

export type ScheduleCellTarget = {
  device: string;
  id: string;
  location: string;
  schedule: ScheduleReference | null;
};

type ScheduleCellProps = { targets: readonly ScheduleCellTarget[]; projectRef?: string };

export function ScheduleCell({ targets, projectRef }: Readonly<ScheduleCellProps>) {
  const t = useTranslations("projectRankTracker.list");
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const state = scheduleRowState(targets);
  const label =
    state.kind === "manual"
      ? t("scheduleManual")
      : state.kind === "mixed"
        ? t("scheduleMixed", { count: state.scheduleCount })
        : state.name;
  const schedule = targets.find((target) => target.schedule)?.schedule;
  const href = (id: string) =>
    projectRef && !id.startsWith("legacy:") ? projectSchedulesPath(projectRef, id) : undefined;
  const linkClass =
    "text-[12.5px] font-semibold text-accent-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent-solid";
  if (state.kind === "manual") return <span className="text-[12px] text-fg-muted">{label}</span>;
  const scheduleHref = schedule ? href(schedule.publicId) : undefined;
  if (state.kind === "named")
    return scheduleHref ? (
      <Link
        className={`${linkClass} block truncate`}
        href={scheduleHref}
        onClick={(event) => event.stopPropagation()}
      >
        {label}
      </Link>
    ) : (
      <span className="block truncate text-[12.5px] font-medium text-fg">{label}</span>
    );
  return (
    <>
      <button
        aria-expanded={Boolean(anchor)}
        aria-haspopup="menu"
        className={linkClass}
        onClick={(event) => {
          event.stopPropagation();
          setAnchor(event.currentTarget);
        }}
        type="button"
      >
        {label}
      </button>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        contentProps={{ className: "max-w-[calc(100vw-2rem)]" }}
        onClick={(event) => event.stopPropagation()}
      >
        {[...new Map(targets.map((target) => [target.id, target])).values()].map((target) => {
          const path = target.schedule ? href(target.schedule.publicId) : undefined;
          return (
            <MenuItem
              key={target.id}
              component={path ? Link : undefined}
              href={path}
              disabled={!path}
              onSelect={() => setAnchor(null)}
            >
              <span className="grid gap-1 whitespace-normal">
                <span className="font-semibold">
                  {target.schedule?.name ?? t("scheduleManual")}
                </span>
                <span className="text-[11px] text-fg-muted">
                  <MarketLabel device={target.device} location={target.location} />
                </span>
              </span>
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}
