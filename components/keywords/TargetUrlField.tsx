import { FieldLabel } from "@/components/ui";
import { FIELD_HELP } from "@/lib/settings/field-help";
import { cn } from "@/lib/ui/cn";
import { forwardRef, type InputHTMLAttributes, useId } from "react";

type TargetUrlFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  className?: string;
  error?: string;
  help?: string;
  label?: string;
};

export const TargetUrlField = forwardRef<HTMLInputElement, TargetUrlFieldProps>(
  function TargetUrlField(
    { className, error, help = FIELD_HELP.targetUrl, label = "Target URL", ...inputProps },
    ref,
  ) {
    const generatedId = useId();
    const inputId = inputProps.id ?? inputProps.name ?? generatedId;

    return (
      <div
        className={cn(
          "flex min-w-0 flex-col gap-1.5 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-faint",
          className,
        )}
      >
        <FieldLabel help={help} htmlFor={inputId} label={label} />
        <input
          aria-label={label}
          className="min-h-10 w-full rounded-lg border border-border-strong bg-bg-sunken px-3 font-mono text-[13px] font-medium normal-case tracking-normal text-fg outline-none transition-colors focus:border-accent"
          {...inputProps}
          id={inputId}
          ref={ref}
        />
        {error ? <span className="normal-case tracking-normal text-red">{error}</span> : null}
      </div>
    );
  },
);
