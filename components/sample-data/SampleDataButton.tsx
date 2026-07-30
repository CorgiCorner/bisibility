"use client";

import { installSampleData } from "@/lib/actions/sample-data";
import { appRootPath } from "@/lib/routing/app-path";
import { actionErrorMessage } from "@/lib/ui/action-error";
import Button, { type ButtonProps } from "@mui/material/Button";
import { DatabaseIcon as Database } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type SampleDataButtonProps = {
  action?: () => Promise<unknown>;
  className?: string;
  fullWidth?: boolean;
  label?: string;
  size?: NonNullable<ButtonProps["size"]>;
  sx?: NonNullable<ButtonProps["sx"]>;
  variant?: NonNullable<ButtonProps["variant"]>;
};

export function SampleDataButton({
  action = installSampleData,
  className,
  fullWidth = false,
  label = "Load sample project",
  size = "small",
  sx,
  variant = "contained",
}: Readonly<SampleDataButtonProps>) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(() => {
      void action()
        .then(() => {
          router.push(appRootPath());
          router.refresh();
        })
        .catch((error_: unknown) => {
          setError(actionErrorMessage(error_, "Sample project could not be loaded."));
        });
    });
  }

  return (
    <span className={className}>
      <Button
        disabled={pending}
        fullWidth={fullWidth}
        onClick={handleClick}
        size={size}
        startIcon={<Database size={15} weight="bold" />}
        sx={sx}
        type="button"
        variant={variant}
      >
        {pending ? "Loading..." : label}
      </Button>
      {error ? (
        <span className="mt-2 block text-xs text-red" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
