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
  return (
    <label className={labelClass} htmlFor={id}>
      {label}
      {password ? (
        <PasswordInput
          className={`${inputClass} truncate pr-12 font-mono text-sm`}
          disabled={disabled}
          id={id}
          placeholder={placeholder}
          {...registration}
        />
      ) : (
        <input
          autoComplete="off"
          className={`${inputClass} font-mono text-sm`}
          disabled={disabled}
          id={id}
          placeholder={placeholder}
          type="text"
          {...registration}
        />
      )}
      {error ? <span className={`${feedbackClass} text-red-text`}>{error}</span> : null}
    </label>
  );
}
