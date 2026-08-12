"use client";

import { Button } from "@/components/ui";
import type { ReactNode } from "react";

type OnboardingStepSkipBaseProps = {
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
};

type OnboardingStepSkipProps = OnboardingStepSkipBaseProps &
  ({ href: string; onClick?: never } | { href?: never; onClick: () => void });

const controlClass = "cursor-pointer text-accent-text hover:underline";

export function OnboardingStepSkip({
  ariaLabel,
  children,
  className = "",
  href,
  onClick,
}: Readonly<OnboardingStepSkipProps>) {
  const classes = `${controlClass} ${className}`.trim();
  return (
    <Button
      aria-label={ariaLabel}
      className={classes}
      {...(onClick ? { onClick, type: "button" as const } : { href: href ?? "" })}
      size="xs"
      sx={{ color: "var(--accent-text)", minWidth: 0 }}
      variant="ghost"
    >
      {children}
    </Button>
  );
}
