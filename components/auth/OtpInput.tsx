"use client";

import { cn } from "@/lib/ui/cn";
import { type ForwardedRef, forwardRef, useRef } from "react";

export type OtpInputProps = {
  disabled?: boolean;
  error?: boolean;
  id?: string;
  length?: number;
  name?: string;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  onChange: (value: string[]) => void;
  onDigitEntry?: () => void;
  value: string[];
};

function assignRef(ref: ForwardedRef<HTMLInputElement>, value: HTMLInputElement | null) {
  if (typeof ref === "function") {
    ref(value);
    return;
  }

  if (ref) {
    ref.current = value;
  }
}

export const OtpInput = forwardRef<HTMLInputElement, OtpInputProps>(function OtpInput(
  { disabled = false, error = false, id, length = 6, name, onBlur, onChange, onDigitEntry, value },
  ref,
) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, index) => value[index] ?? "");
  const boxIds = Array.from({ length }, (_, index) => `otp-box-${index}`);

  function setInputRef(index: number, element: HTMLInputElement | null) {
    inputRefs.current[index] = element;

    if (index === 0) {
      assignRef(ref, element);
    }
  }

  function focusIndex(index: number) {
    inputRefs.current[index]?.focus();
  }

  function setDigits(next: string[]) {
    onChange(next);
  }

  function distribute(startIndex: number, rawValue: string) {
    const nextDigits = rawValue
      .replace(/\D/g, "")
      .slice(0, length - startIndex)
      .split("");

    if (!nextDigits.length) {
      const next = [...digits];
      next[startIndex] = "";
      setDigits(next);
      return;
    }

    const next = [...digits];

    nextDigits.forEach((digit, offset) => {
      next[startIndex + offset] = digit;
    });

    setDigits(next);
    onDigitEntry?.();

    const finalIndex = Math.min(startIndex + nextDigits.length - 1, length - 1);
    focusIndex(nextDigits.length === 1 && finalIndex < length - 1 ? finalIndex + 1 : finalIndex);
  }

  function handleChange(index: number, event: React.ChangeEvent<HTMLInputElement>) {
    distribute(index, event.currentTarget.value);
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    // Modifier shortcuts must bypass digit filtering so paste and selection still fire.
    if (event.metaKey || event.ctrlKey) {
      return;
    }

    if (event.key.length === 1 && !/^\d$/.test(event.key)) {
      event.preventDefault();
      return;
    }

    if (event.key === "Backspace" && !digits[index] && index > 0) {
      event.preventDefault();
      const next = [...digits];
      next[index - 1] = "";
      setDigits(next);
      focusIndex(index - 1);
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);

    if (!pasted) {
      return;
    }

    event.preventDefault();
    const next = Array.from({ length }, (_, index) => pasted[index] ?? "");
    setDigits(next);
    onDigitEntry?.();
    focusIndex(Math.min(pasted.length, length) - 1);
  }

  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="sr-only">OTP digits</legend>
      <div className={cn("mt-0 grid grid-cols-6 gap-[9px]", error && "bv-err")} data-m="otp-row">
        {boxIds.map((boxId, index) => {
          const digit = digits[index] ?? "";

          return (
            <input
              aria-label={index === 0 ? "Code" : `Code digit ${index + 1}`}
              autoComplete="one-time-code"
              // biome-ignore lint/a11y/noAutofocus: HANDOFF-3 requires OTP autofocus without useEffect.
              autoFocus={index === 0}
              className={cn(
                "aspect-square w-full min-w-0 rounded-[11px] border-[1.5px] bg-bg-elev text-center font-mono text-[24px] font-semibold text-fg transition-colors focus:border-accent disabled:cursor-not-allowed disabled:opacity-55",
                digit && "border-accent bg-accent-soft",
                !digit && "border-border-strong",
                error &&
                  "border-red bg-[color-mix(in_srgb,var(--red)_7%,transparent)] focus:border-red",
              )}
              data-otp={index}
              disabled={disabled}
              id={index === 0 ? id : undefined}
              inputMode="numeric"
              key={boxId}
              maxLength={1}
              name={index === 0 ? name : undefined}
              onBlur={index === 0 ? onBlur : undefined}
              onChange={(event) => handleChange(index, event)}
              onFocus={(event) => event.currentTarget.select()}
              onKeyDown={(event) => handleKeyDown(index, event)}
              onPaste={handlePaste}
              pattern="[0-9]"
              ref={(element) => setInputRef(index, element)}
              value={digit}
            />
          );
        })}
      </div>
    </fieldset>
  );
});
