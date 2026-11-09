"use client";

import { FieldLabel } from "@/components/ui/FieldLabel";
import type { UseFormRegisterReturn } from "react-hook-form";

const fieldClassName =
  "mt-1.5 flex h-10 w-full max-w-md items-center rounded-control border border-border-control bg-transparent px-3 focus-within:border-accent";
const inputClassName = "w-full bg-transparent text-sm text-fg outline-none";

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
    <div>
      <FieldLabel className="text-sm font-medium text-fg" htmlFor={id} label={label} />
      <span className={fieldClassName}>
        <input
          autoComplete="off"
          className={inputClassName}
          id={id}
          type={type}
          {...registration}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      </span>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-red-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
