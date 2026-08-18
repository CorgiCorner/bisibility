"use client";

import { docsLinkProps } from "@/lib/site/site";
import { MOTION_MENU_EXIT } from "@/lib/ui/motion";
import {
  ArrowsClockwiseIcon as ArrowsClockwise,
  CaretRightIcon as CaretRight,
  WarningCircleIcon as WarningCircle,
  XIcon as X,
} from "@phosphor-icons/react";
import Link from "next/link";
import {
  type CSSProperties,
  type ReactNode,
  type TransitionEvent,
  useCallback,
  useRef,
  useState,
} from "react";

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
    color: "var(--yellow-text)",
    hover: "color-mix(in srgb, var(--yellow) 14%, transparent)",
  },
} satisfies Record<
  AlertBannerProps["tint"],
  { background: string | null; color: string; hover: string }
>;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const FALLBACK_BUFFER_MS = 50;

function ActionIcon({ icon }: Readonly<{ icon?: NonNullable<AlertBannerAction["icon"]> }>) {
  if (icon === "retry") {
    return <ArrowsClockwise aria-hidden size={14} />;
  }
  if (icon === "arrow") {
    return <CaretRight aria-hidden size={14} weight="bold" />;
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
  const [exiting, setExiting] = useState(false);
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissedRef = useRef(false);
  const dismissStartedRef = useRef(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const complete = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    if (fallbackRef.current !== null) {
      clearTimeout(fallbackRef.current);
      fallbackRef.current = null;
    }
    onDismissRef.current?.();
  }, []);

  const refCallback = useCallback((node: HTMLElement | null) => {
    if (node === null && fallbackRef.current !== null) {
      clearTimeout(fallbackRef.current);
      fallbackRef.current = null;
    }
  }, []);

  const actionClass =
    "inline-flex items-center gap-1.5 rounded-lg border bg-bg-elev px-3 py-1.5 text-[12px] font-semibold";
  const actionStyle = { borderColor: style.color, color: "var(--fg)" };
  const actionContent = action ? (
    <>
      <ActionIcon icon={action.icon} />
      {action.label}
    </>
  ) : null;

  function handleDismiss() {
    if (dismissedRef.current || !onDismissRef.current) return;
    if (window.matchMedia(REDUCED_MOTION).matches) {
      complete();
      return;
    }
    if (dismissStartedRef.current) return;
    dismissStartedRef.current = true;
    setExiting(true);
    fallbackRef.current = setTimeout(() => {
      fallbackRef.current = null;
      complete();
    }, MOTION_MENU_EXIT + FALLBACK_BUFFER_MS);
  }

  function handleTransitionEnd(event: TransitionEvent<HTMLElement>) {
    if (
      event.currentTarget === event.target &&
      event.propertyName === "opacity" &&
      exiting &&
      !dismissedRef.current &&
      onDismissRef.current
    ) {
      complete();
    }
  }

  return (
    <output
      className={`flex flex-wrap items-center gap-3 border-b border-border px-4 py-[11px] transition-opacity duration-[var(--motion-menu-exit)] ease-[ease] ${
        exiting ? "pointer-events-none opacity-0" : ""
      } ${tint === "red" ? "bg-red/[0.07]" : ""}`}
      onTransitionEnd={handleTransitionEnd}
      ref={refCallback}
      style={style.background ? { backgroundColor: style.background } : undefined}
    >
      <WarningCircle className="shrink-0" size={17} style={{ color: style.color }} weight="fill" />
      <span className="min-w-[220px] flex-1 text-[12.5px] text-fg">
        <strong className="font-semibold">{title}</strong>
        {detail ? (
          <>
            {" "}
            <span>{detail}</span>
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
          className="grid h-7 w-7 place-items-center rounded-[7px] text-fg-muted hover:bg-[var(--alert-dismiss-hover)] focus-visible:bg-[var(--alert-dismiss-hover)]"
          onClick={handleDismiss}
          style={{ "--alert-dismiss-hover": style.hover } as CSSProperties}
          type="button"
        >
          <X size={13} weight="bold" />
        </button>
      ) : null}
    </output>
  );
}
