"use client";

import { FieldLabel } from "@/components/ui/FieldLabel";
import { Input } from "@/components/ui/Input";
import type { UseFormRegisterReturn } from "react-hook-form";

export function InstanceMailSettingsField({
  error,
  id,
  label,
  registration,
  type = "text",
}: {
  error?: string;
  id: string;
  label: string;
  registration: UseFormRegisterReturn;
  type?: string;
}) {
  return (
    <div className="grid max-w-md gap-1.5">
      <FieldLabel className="text-sm font-medium text-fg" htmlFor={id} label={label} />
      <Input
        autoComplete="off"
        id={id}
        type={type}
        {...registration}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-red-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
