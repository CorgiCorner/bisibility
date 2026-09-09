"use client";

import { IconButton, type IconButtonProps } from "@/components/ui/IconButton";
import { cn } from "@/lib/ui/cn";
import { MOTION_PRESS } from "@/lib/ui/motion";
import { CheckIcon as Check } from "@phosphor-icons/react/dist/csr/Check";
import { CopyIcon as Copy } from "@phosphor-icons/react/dist/csr/Copy";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/dist/csr/WarningCircle";
import { cva } from "class-variance-authority";
import { type MouseEvent, useCallback, useRef, useState } from "react";
import { Tooltip } from "./Tooltip";
import { useToast } from "./toast-context";

export type CopyButtonProps = Omit<IconButtonProps, "children" | "onClick" | "ref" | "size"> & {
  text: string;
  label?: string;
  size?: "xs" | "sm" | "md" | "lg";
};

const copyButtonVariants = cva("", {
  variants: {
    size: {
      xs: "min-h-3 min-w-3 p-0",
      sm: "min-h-6 min-w-6",
      md: "min-h-[30px] min-w-[30px]",
      lg: "min-h-9 min-w-9",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

const iconButtonSizeBySize = {
  xs: "small",
  sm: "small",
  md: "medium",
  lg: "large",
} as const;

const copyIconSizeBySize = {
  xs: 12,
  sm: 12,
  md: 14,
  lg: 16,
} as const;

type CopyState = "idle" | "copying" | "copied" | "error";

const COPY_RESET_MS = 1200;

export function CopyButton({
  className,
  text,
  label = "Copy",
  size = "md",
  style,
  ...props
}: CopyButtonProps) {
  const [state, setState] = useState<CopyState>("idle");
  const { showToast } = useToast();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const clearResetTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Stable callback ref: React calls it with null on unmount, which clears any
  // pending reset timer and flips the mounted flag so a late clipboard Promise
  // cannot touch state, toast, or timers after the component is gone.
  const setNodeRef = useCallback(
    (node: HTMLButtonElement | null) => {
      mountedRef.current = node !== null;
      if (!node) {
        clearResetTimer();
      }
    },
    [clearResetTimer],
  );

  async function handleCopy(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (state === "copying") return;

    clearResetTimer();
    setState("copying");

    try {
      const clipboard = navigator.clipboard;
      if (!clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }
      await clipboard.writeText(text);
      if (!mountedRef.current) return;
      setState("copied");
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        setState("idle");
      }, COPY_RESET_MS);
    } catch {
      if (!mountedRef.current) return;
      setState("error");
      showToast("Copy failed", { severity: "error" });
    }
  }

  const copied = state === "copied";
  const error = state === "error";
  const tooltipTitle = copied ? "Copied!" : error ? "Copy failed" : label;
  const color = copied ? "var(--green)" : error ? "var(--red)" : "var(--fg-muted)";
  const hoverColor = copied ? "var(--green)" : error ? "var(--red)" : "var(--accent)";
  const hoverBg = copied
    ? "var(--green-soft)"
    : error
      ? "color-mix(in srgb, var(--red) 12%, transparent)"
      : "var(--accent-soft)";

  return (
    <Tooltip content={tooltipTitle} semantics="label">
      <IconButton
        aria-label={tooltipTitle}
        className={cn(
          copyButtonVariants({ size }),
          "motion-safe:active:not-focus-visible:not-disabled:scale-[0.97]",
          className,
        )}
        onClick={handleCopy}
        ref={setNodeRef}
        size={iconButtonSizeBySize[size]}
        style={{
          "--control-color": color,
          "--control-hover-color": hoverColor,
          "--control-hover-background-color": hoverBg,
          ...(size === "xs" ? { minHeight: 12, minWidth: 12, padding: 0 } : {}),
          transition: `background-color ${MOTION_PRESS}ms ease, color ${MOTION_PRESS}ms ease, transform ${MOTION_PRESS}ms ease`,
          ...style,
        }}
        {...props}
      >
        {copied ? (
          <Check size={copyIconSizeBySize[size]} weight="regular" />
        ) : error ? (
          <WarningCircle size={copyIconSizeBySize[size]} weight="regular" />
        ) : (
          <Copy size={copyIconSizeBySize[size]} weight="regular" />
        )}
      </IconButton>
    </Tooltip>
  );
}
