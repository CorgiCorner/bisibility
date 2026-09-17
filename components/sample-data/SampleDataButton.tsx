"use client";

import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { Button, type ButtonProps } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { installSampleData } from "@/lib/actions/sample-data";
import { presentActionError } from "@/lib/ui/action-error";
import { cn } from "@/lib/ui/cn";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type SampleDataButtonProps = {
  action?: () => Promise<{ destination: string }>;
  className?: string;
  fullWidth?: boolean;
  help?: string;
  label: string;
  size?: ButtonProps["size"];
  style?: ButtonProps["style"];
  variant?: ButtonProps["variant"];
};

export function SampleDataButton({
  action = installSampleData,
  className,
  fullWidth = false,
  help,
  label,
  size = "sm",
  style,
  variant = "primary",
}: Readonly<SampleDataButtonProps>) {
  const sharedErrors = useSharedErrorMessages();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(() => {
      void action()
        .then(({ destination }) => {
          router.push(destination);
          router.refresh();
        })
        .catch((error_: unknown) => {
          setError(presentActionError(error_, sharedErrors));
        });
    });
  }

  const button = (
    <Button
      aria-busy={pending}
      disabled={pending}
      fullWidth={fullWidth}
      onClick={handleClick}
      size={size}
      style={style}
      type="button"
      variant={variant}
    >
      {/* The label keeps its words while the action runs: swapping it for "Loading..."
          changed the width of a link inside a sentence, so the line reflowed on click. */}
      <span aria-live="polite">{pending ? `${label}\u2026` : label}</span>
    </Button>
  );

  return (
    <span className={cn("inline-flex items-end", className)}>
      {help ? (
        <Tooltip content={help} placement="top" semantics="description">
          {button}
        </Tooltip>
      ) : (
        button
      )}
      {error ? (
        <span className="mt-2 block text-xs text-red-text" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
