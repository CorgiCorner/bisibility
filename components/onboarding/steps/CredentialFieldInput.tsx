"use client";

import {
  feedbackClass,
  inputClass,
  labelClass,
} from "@/components/onboarding/onboarding-form-utils";
import { PasswordInput } from "@/components/ui/PasswordInput";
import type { UseFormRegisterReturn } from "react-hook-form";

type CredentialFieldInputProps = {
  description?: string;
  disabled?: boolean;
  error?: string;
  id: string;
  label: string;
  password?: boolean;
  placeholder: string;
  registration: UseFormRegisterReturn;
};

export function CredentialFieldInput({
  description,
  disabled = false,
  error,
  id,
  label,
  password = false,
  placeholder,
  registration,
}: Readonly<CredentialFieldInputProps>) {
  const errorId = `${id}-error`;
  const descriptionId = `${id}-description`;
  const accessibility = {
    "aria-describedby":
      [description ? descriptionId : null, error ? errorId : null].filter(Boolean).join(" ") ||
      undefined,
    "aria-invalid": error ? true : undefined,
  };
  return (
    <div className={`${labelClass} w-full`}>
      <label htmlFor={id}>{label}</label>
      {password ? (
        <PasswordInput
          {...accessibility}
          className={`${inputClass} truncate pr-12 text-sm`}
          disabled={disabled}
          id={id}
          placeholder={placeholder}
          {...registration}
        />
      ) : (
        <input
          {...accessibility}
          autoComplete="off"
          className={`${inputClass} text-sm`}
          disabled={disabled}
          id={id}
          placeholder={placeholder}
          type="text"
          {...registration}
        />
      )}
      {description ? (
        <span
          className="mt-1 text-[11.5px] normal-case leading-[1.5] tracking-normal text-fg-muted"
          id={descriptionId}
        >
          {description}
        </span>
      ) : null}
      {error ? (
        <span className={`${feedbackClass} text-red-text`} id={errorId}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
