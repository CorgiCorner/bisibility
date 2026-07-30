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
      {help ? <InfoTooltip text={help} /> : null}
    </span>
  );
}
