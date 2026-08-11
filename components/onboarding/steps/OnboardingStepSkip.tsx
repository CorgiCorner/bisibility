"use client";

import { Button } from "@/components/ui";
import Link from "next/link";
import type { ReactNode } from "react";

type OnboardingStepSkipBaseProps = {
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
};

type OnboardingStepSkipProps = OnboardingStepSkipBaseProps &
  ({ href: string; onClick?: never } | { href?: never; onClick: () => void });

const controlClass =
  "cursor-pointer border-0 bg-transparent p-0 font-semibold text-accent-text hover:underline";

export function OnboardingStepSkip({
  ariaLabel,
  children,
  className = "",
  href,
  onClick,
}: Readonly<OnboardingStepSkipProps>) {
  const classes = `${controlClass} ${className}`.trim();
  if (onClick) {
    return (
      <Button
        aria-label={ariaLabel}
        className={classes}
        onClick={onClick}
        size="xs"
        sx={{ color: "var(--accent-text)", minHeight: 0, minWidth: 0, padding: 0 }}
        type="button"
        variant="ghost"
      >
        {children}
      </Button>
    );
  }
  return (
    <Link aria-label={ariaLabel} className={classes} href={href ?? ""}>
      {children}
    </Link>
  );
}
