"use client";

import { formatMoneyCents } from "@/lib/format/money";
import { docsLinkProps } from "@/lib/site/site";
import Popover from "@mui/material/Popover";
import { InfoIcon as Info } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";

export type SpendMeterDocsInfoProps = {
  docsHref: string;
  editBudgetHref?: string;
  sessionCents?: number;
};

/** Compact popover replacement for the always-visible budget docs link. */
export function SpendMeterDocsInfo({
  docsHref,
  editBudgetHref,
  sessionCents,
}: Readonly<SpendMeterDocsInfoProps>) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  return (
    <>
      <button
        aria-label="About provider spend"
        className="inline-flex h-3.5 w-3.5 shrink-0 cursor-help appearance-none items-center justify-center rounded-full border-0 bg-transparent p-0 text-fg-faint transition-colors hover:text-fg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        onClick={(event) => setAnchor(event.currentTarget)}
        type="button"
      >
        <Info aria-hidden size={12} weight="bold" />
      </button>
      <Popover
        anchorEl={anchor}
        anchorOrigin={{ horizontal: "left", vertical: "bottom" }}
        onClose={() => setAnchor(null)}
        open={Boolean(anchor)}
        slotProps={{
          paper: {
            sx: {
              bgcolor: "var(--bg-elev)",
              border: "1px solid var(--border-strong)",
              borderRadius: "12px",
              boxShadow: "none",
              overflow: "hidden",
            },
          },
        }}
      >
        <div className="w-[240px] bg-bg-elev p-3.5 text-fg">
          <p className="m-0 text-[12px] leading-5 text-fg-muted">
            Provider spend so far this month against your monthly budget cap.
          </p>
          {sessionCents == null ? null : (
            <p className="m-0 mt-1 font-mono text-[11px] text-fg-muted tabular-nums">
              {formatMoneyCents(sessionCents)} this session
            </p>
          )}
          <div className="mt-2 flex items-center gap-3">
            <a
              className="inline-flex text-[12px] font-medium text-accent hover:text-accent-hover hover:underline"
              href={docsHref}
              {...docsLinkProps(docsHref)}
            >
              How budgets work
            </a>
            {editBudgetHref ? (
              <Link
                className="inline-flex text-[12px] font-medium text-accent hover:text-accent-hover hover:underline"
                href={editBudgetHref}
              >
                Edit budget
              </Link>
            ) : null}
          </div>
        </div>
      </Popover>
    </>
  );
}
