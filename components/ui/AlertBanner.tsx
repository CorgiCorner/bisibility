"use client";

import { docsLinkProps } from "@/lib/site/site";
import {
  ArrowRightIcon as ArrowRight,
  ArrowsClockwiseIcon as ArrowsClockwise,
  WarningCircleIcon as WarningCircle,
  XIcon as X,
} from "@phosphor-icons/react";
import Link from "next/link";
import type { ReactNode } from "react";

export type AlertBannerAction = {
  href?: string;
  icon?: "arrow" | "retry";
  label: string;
  onClick?: () => void;
};

export type AlertBannerProps = {
  action?: AlertBannerAction;
  detail?: ReactNode;
  onDismiss?: () => void;
  title: string;
  tint: "red" | "yellow";
};

const tintStyles = {
  red: {
    background: null,
    color: "var(--red)",
    hover: "color-mix(in srgb, var(--red) 10%, transparent)",
  },
  yellow: {
    background: "color-mix(in srgb, var(--yellow) 10%, transparent)",
    color: "var(--yellow-strong)",
    hover: "color-mix(in srgb, var(--yellow) 14%, transparent)",
  },
} satisfies Record<
  AlertBannerProps["tint"],
  { background: string | null; color: string; hover: string }
>;

function ActionIcon({ icon }: Readonly<{ icon?: NonNullable<AlertBannerAction["icon"]> }>) {
  if (icon === "retry") {
    return <ArrowsClockwise aria-hidden size={14} />;
  }
  if (icon === "arrow") {
    return <ArrowRight aria-hidden size={14} weight="bold" />;
  }
  return null;
}

export function AlertBanner({
  action,
  detail,
  onDismiss,
  tint,
  title,
}: Readonly<AlertBannerProps>) {
  const style = tintStyles[tint];
  const actionClass =
    "inline-flex items-center gap-1.5 rounded-lg border bg-bg-elev px-3 py-1.5 text-[12px] font-semibold";
  const actionStyle = { borderColor: style.color, color: style.color };
  const actionContent = action ? (
    <>
      <ActionIcon icon={action.icon} />
      {action.label}
    </>
  ) : null;

  return (
    <output
      className={`flex flex-wrap items-center gap-3 border-b border-border px-4 py-[11px] ${
        tint === "red" ? "bg-red/[0.07]" : ""
      }`}
      style={style.background ? { backgroundColor: style.background } : undefined}
    >
      <WarningCircle className="shrink-0" size={17} style={{ color: style.color }} weight="fill" />
      <span className="min-w-[220px] flex-1 text-[12.5px] text-fg">
        <strong className="font-semibold">{title}</strong>
        {detail ? (
          <>
            {" "}
            <span className="text-fg-muted">{detail}</span>
          </>
        ) : null}
      </span>
      {action?.href ? (
        <Link
          className={actionClass}
          href={action.href}
          style={actionStyle}
          {...docsLinkProps(action.href)}
        >
          {actionContent}
        </Link>
      ) : null}
      {action && !action.href ? (
        <button className={actionClass} onClick={action.onClick} style={actionStyle} type="button">
          {actionContent}
        </button>
      ) : null}
      {onDismiss ? (
        <button
          aria-label="Dismiss alert"
          className="grid h-7 w-7 place-items-center rounded-[7px] text-fg-muted"
          onClick={onDismiss}
          onMouseEnter={(event) => {
            event.currentTarget.style.backgroundColor = style.hover;
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.backgroundColor = "transparent";
          }}
          type="button"
        >
          <X size={13} weight="bold" />
        </button>
      ) : null}
    </output>
  );
}
