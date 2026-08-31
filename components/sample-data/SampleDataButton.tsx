"use client";

import { Button, type ButtonProps, Tooltip } from "@/components/ui";
import { installSampleData } from "@/lib/actions/sample-data";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { cn } from "@/lib/ui/cn";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export const SAMPLE_DATA_BUTTON_TOOLTIP =
  "Loads a temporary sample project and skips the rest of setup.";

type SampleDataButtonProps = {
  action?: () => Promise<{ destination: string }>;
  className?: string;
  fullWidth?: boolean;
  help?: string;
  label?: string;
  size?: ButtonProps["size"];
  sx?: ButtonProps["sx"];
  variant?: ButtonProps["variant"];
};

export function SampleDataButton({
  action = installSampleData,
  className,
  fullWidth = false,
  help,
  label = "Load sample project",
  size = "sm",
  sx,
  variant = "primary",
}: Readonly<SampleDataButtonProps>) {
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
          setError(actionErrorMessage(error_, "Sample project could not be loaded."));
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
      sx={sx}
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
