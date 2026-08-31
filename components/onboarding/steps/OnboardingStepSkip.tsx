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

export function OnboardingStepSkip({
  ariaLabel,
  children,
  className,
  href,
  onClick,
}: Readonly<OnboardingStepSkipProps>) {
  return (
    <Button
      aria-label={ariaLabel}
      className={className}
      {...(onClick ? { onClick, type: "button" as const } : { href: href ?? "" })}
      size="lg"
      variant="ghost"
    >
      {children}
    </Button>
  );
}
