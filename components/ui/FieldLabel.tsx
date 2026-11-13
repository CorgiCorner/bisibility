import { cn } from "@/lib/ui/cn";
import type { ReactNode } from "react";
import { InfoTooltip } from "./InfoTooltip";

export type FieldLabelProps = {
  className?: string;
  help?: string;
  htmlFor?: string;
  label: ReactNode;
};

export function FieldLabel({ className, help, htmlFor, label }: Readonly<FieldLabelProps>) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>}
      {help ? <InfoTooltip size="label" text={help} /> : null}
    </span>
  );
}

/** Shared label, control and caption rhythm for form fields. */
export function FormField({
  children,
  caption,
  captionId,
  className,
  ...labelProps
}: Readonly<FieldLabelProps & { children: ReactNode; caption?: ReactNode; captionId?: string }>) {
  return (
    <div className={cn("grid min-w-0 gap-2 text-ui-body", className)} data-form-field="">
      <FieldLabel {...labelProps} className="h-5" />
      {children}
      {caption ? (
        <div className="text-ui-caption text-fg-muted" id={captionId}>
          {caption}
        </div>
      ) : null}
    </div>
  );
}
