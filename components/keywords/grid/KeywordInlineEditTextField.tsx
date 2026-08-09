import { FieldLabel, Input } from "@/components/ui";
import { cn } from "@/lib/ui/cn";
import { type InputHTMLAttributes, useId } from "react";

type KeywordInlineEditTextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  error?: string;
  help?: string;
  label: string;
  mono?: boolean;
  wide?: boolean;
};

export function KeywordInlineEditTextField({
  error,
  help,
  label,
  mono = false,
  wide = false,
  ...inputProps
}: Readonly<KeywordInlineEditTextFieldProps>) {
  const generatedId = useId();
  const inputId = inputProps.id ?? inputProps.name ?? generatedId;

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted",
        wide && "md:col-span-3",
      )}
    >
      <FieldLabel help={help} htmlFor={inputId} label={label} />
      <Input
        aria-label={label}
        className={cn(
          "min-h-10 rounded-lg px-3 text-[13px] font-medium normal-case tracking-normal",
          mono ? "font-mono" : "font-sans",
        )}
        {...inputProps}
        id={inputId}
      />
      {error ? <span className="text-red-text">{error}</span> : null}
    </div>
  );
}
