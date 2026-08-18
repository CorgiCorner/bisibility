"use client";

import { cn } from "@/lib/ui/cn";
import { EyeIcon as Eye, EyeSlashIcon as EyeSlash } from "@phosphor-icons/react";
import { forwardRef, type InputHTMLAttributes, useState } from "react";
import { inputClassName } from "./Input";

export type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  wrapperClassName?: string;
};

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, disabled, wrapperClassName, ...props }, ref) {
    const [showValue, setShowValue] = useState(false);

    return (
      <span className={cn("relative block", wrapperClassName)}>
        <input
          autoComplete="off"
          className={cn(inputClassName, "w-full pr-12", className)}
          disabled={disabled}
          ref={ref}
          type={showValue ? "text" : "password"}
          {...props}
        />
        <button
          aria-label={showValue ? "Hide password" : "Show password"}
          aria-pressed={showValue}
          className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md border-0 bg-transparent text-fg-muted transition-[color,background-color,transform] duration-[var(--motion-press)] hover:bg-bg-elev hover:text-fg focus:outline-none focus:ring-2 focus:ring-accent/40 motion-safe:active:not-focus-visible:scale-[0.97] disabled:cursor-not-allowed disabled:bg-bg-sunken disabled:text-fg-muted"
          disabled={disabled}
          onClick={() => setShowValue((visible) => !visible)}
          type="button"
        >
          {showValue ? <EyeSlash aria-hidden size={17} /> : <Eye aria-hidden size={17} />}
        </button>
      </span>
    );
  },
);
