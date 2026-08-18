import { Card, MonoText, SectionTitle } from "@/components/ui";
import { cn } from "@/lib/ui/cn";
import type { ReactNode, Ref } from "react";

const USAGE_BILLING_SECTION_ID = "usage-billing";

// Only the fragment id is shared. The path is project-scoped now, so callers build it
// with appPath(projectRef, "settings") - a constant href here would be a dead route.
export const USAGE_BILLING_TARGET = {
  id: USAGE_BILLING_SECTION_ID,
} as const;

export type SettingsSectionProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Anchor id so app banners can deep-link to the section. */
  id?: string;
  sectionRef?: Ref<HTMLElement>;
  tone?: "default" | "danger";
};

export function SettingsSection({
  title,
  description,
  action,
  badge,
  children,
  className,
  contentClassName,
  id,
  sectionRef,
  tone = "default",
}: Readonly<SettingsSectionProps>) {
  const titleId = id ? `${id}-title` : undefined;

  return (
    <section
      aria-labelledby={titleId}
      className={cn("space-y-3.5", className)}
      id={id}
      ref={sectionRef}
      tabIndex={id ? -1 : undefined}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <SectionTitle id={titleId}>{title}</SectionTitle>
            {badge}
          </div>
          {description ? (
            <MonoText className="mt-1 max-w-[680px]" muted size="lg">
              {description}
            </MonoText>
          ) : null}
        </div>
        {action ? <div className="flex-none">{action}</div> : null}
      </div>
      <Card
        className={cn(tone === "danger" && "border-red", contentClassName)}
        size="lg"
        sx={tone === "danger" ? { borderColor: "var(--red)" } : undefined}
      >
        {children}
      </Card>
    </section>
  );
}
