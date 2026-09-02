"use client";

import {
  feedbackClass,
  inputClass,
  labelClass,
} from "@/components/onboarding/onboarding-form-utils";
import { PasswordInput } from "@/components/ui";
import type { UseFormRegisterReturn } from "react-hook-form";

type CredentialFieldInputProps = {
  disabled?: boolean;
  error?: string;
  id: string;
  label: string;
  password?: boolean;
  placeholder: string;
  registration: UseFormRegisterReturn;
};

export function CredentialFieldInput({
  disabled = false,
  error,
  id,
  label,
  password = false,
  placeholder,
  registration,
}: Readonly<CredentialFieldInputProps>) {
  const errorId = `${id}-error`;
  const accessibility = {
    "aria-describedby": error ? errorId : undefined,
    "aria-invalid": error ? true : undefined,
  };
  return (
    <label className={`${labelClass} w-full`} htmlFor={id}>
      {label}
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
      {error ? (
        <span className={`${feedbackClass} text-red-text`} id={errorId}>
          {error}
        </span>
      ) : null}
    </label>
  );
}
