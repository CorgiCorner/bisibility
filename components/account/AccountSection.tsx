import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { cn } from "@/lib/ui/cn";
import type { ReactNode } from "react";

export type AccountSectionProps = {
  action?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
  description?: string;
  title: string;
  tone?: "danger" | "default";
};

export function AccountSection({
  action,
  badge,
  children,
  contentClassName,
  description,
  title,
  tone = "default",
}: Readonly<AccountSectionProps>) {
  return (
    <section className="space-y-3.5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 w-full sm:w-auto sm:flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SectionTitle>{title}</SectionTitle>
            {badge}
          </div>
          {description ? (
            <p className="m-0 mt-[3px] max-w-[680px] text-[12.5px] leading-normal text-fg-muted">
              {description}
            </p>
          ) : null}
        </div>
        {action ? (
          <div className="ml-auto flex min-h-9 shrink-0 items-center gap-3">{action}</div>
        ) : null}
      </div>
      <Card
        className={cn("rounded-card p-5", tone === "danger" && "border-red", contentClassName)}
        size="md"
        style={tone === "danger" ? { borderColor: "var(--red)" } : undefined}
      >
        {children}
      </Card>
    </section>
  );
}
