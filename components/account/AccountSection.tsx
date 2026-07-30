import { Card, SectionTitle } from "@/components/ui";
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
    <section className="space-y-[14px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
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
        {action ? <div className="flex-none">{action}</div> : null}
      </div>
      <Card
        className={cn("rounded-[14px] p-5", tone === "danger" && "border-red", contentClassName)}
        size="md"
        sx={tone === "danger" ? { borderColor: "var(--red)" } : undefined}
      >
        {children}
      </Card>
    </section>
  );
}
