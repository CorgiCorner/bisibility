import { FieldLabel } from "@/components/ui/FieldLabel";
import type { ReactNode } from "react";

export function MonitorField({
  label,
  children,
  help,
}: Readonly<{ label: string; children: ReactNode; help?: string }>) {
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <FieldLabel label={label} help={help} className="min-h-6 text-ui-xs text-fg-muted" />
      {children}
    </div>
  );
}
