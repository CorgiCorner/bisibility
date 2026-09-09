"use client";

import { Button } from "@/components/ui/Button";
import type { ReactNode } from "react";

type OnboardingStepSkipBaseProps = {
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
};

type OnboardingStepSkipProps = OnboardingStepSkipBaseProps &
  ({ href: string; onClick?: () => void } | { href?: never; onClick: () => void });

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
      {...(href ? { href, onClick } : { onClick, type: "button" as const })}
      size="lg"
      variant="ghost"
    >
      {children}
    </Button>
  );
}
