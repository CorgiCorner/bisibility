"use client";

import { Popup as Popover } from "@/components/ui/Popup";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import { InfoIcon as Info } from "@phosphor-icons/react/dist/csr/Info";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

export type SpendMeterDocsInfoProps = {
  action?: { href: string; id: "details" | "set_budget" };
  sessionCents?: number;
};

/** Compact popover replacement for the always-visible budget docs link. */
export function SpendMeterDocsInfo({ action, sessionCents }: Readonly<SpendMeterDocsInfoProps>) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const format = useFormatter();
  const t = useTranslations("projectCostEstimate.spendInfo");

  return (
    <>
      <button
        aria-label={t("aria")}
        className="inline-flex h-3.5 w-3.5 shrink-0 cursor-help appearance-none items-center justify-center rounded-full border-0 bg-transparent p-0 text-fg-muted transition-colors hover:text-fg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-solid"
        onClick={(event) => setAnchor(event.currentTarget)}
        type="button"
      >
        <Info aria-hidden size={12} weight="regular" />
      </button>
      <Popover
        anchorEl={anchor}
        align="start"
        side="bottom"
        onClose={() => setAnchor(null)}
        open={Boolean(anchor)}
        contentProps={{
          style: {
            backgroundColor: "var(--bg-elev)",
            border: "1px solid var(--border)",
            borderRadius: UI_RADIUS_ROLES.card,
            boxShadow: "none",
            overflow: "hidden",
          },
        }}
      >
        <div className="w-[240px] bg-bg-elev p-3.5 text-fg">
          <p className="m-0 text-[12px] leading-5 text-fg-muted">{t("description")}</p>
          {sessionCents == null ? null : (
            <p className="m-0 mt-1 font-sans text-[11px] text-fg-muted tabular-nums">
              {t("session", {
                spent: format.number(sessionCents / 100, { currency: "USD", style: "currency" }),
              })}
            </p>
          )}
          {action ? (
            <div className="mt-2">
              <Link
                className="inline-flex text-[12px] font-medium text-accent-text hover:text-accent-text hover:underline"
                href={action.href}
                onClick={() => setAnchor(null)}
              >
                {action.id === "details" ? t("details") : t("setBudget")}
              </Link>
            </div>
          ) : null}
        </div>
      </Popover>
    </>
  );
}
