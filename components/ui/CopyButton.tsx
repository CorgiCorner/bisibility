"use client";

import { cn } from "@/lib/ui/cn";
import { sxArray } from "@/lib/ui/mui-sx";
import IconButton, { type IconButtonProps } from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { CheckIcon as Check, CopyIcon as Copy } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import { type MouseEvent, useRef, useState } from "react";
import { useToast } from "./Toast";

export type CopyButtonProps = Omit<IconButtonProps, "children" | "onClick" | "size"> & {
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

const iconButtonMuiSizeBySize = {
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

export function CopyButton({
  className,
  text,
  label = "Copy",
  size = "md",
  sx,
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const { showToast } = useToast();
  // Keep the copied-state reset timer deduped across rapid clicks.
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleCopy(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    showToast("Copied", { icon: <Check size={18} weight="bold" />, tint: "green" });
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => setCopied(false), 1200);
  }

  return (
    <Tooltip title={copied ? "Copied!" : label}>
      <IconButton
        aria-label={copied ? "Copied" : label}
        className={cn(copyButtonVariants({ size }), className)}
        onClick={handleCopy}
        size={iconButtonMuiSizeBySize[size]}
        sx={[
          {
            color: copied ? "var(--green)" : "var(--fg-muted)",
            ...(size === "xs" ? { minHeight: 12, minWidth: 12, padding: 0 } : {}),
            "&:hover": {
              backgroundColor: copied ? "var(--green-soft)" : "var(--accent-soft)",
              color: copied ? "var(--green)" : "var(--accent)",
            },
          },
          ...sxArray(sx),
        ]}
        {...props}
      >
        {copied ? (
          <Check size={copyIconSizeBySize[size]} weight="bold" />
        ) : (
          <Copy size={copyIconSizeBySize[size]} />
        )}
      </IconButton>
    </Tooltip>
  );
}
