import { settingsCardFrameClassName } from "@/components/settings/shell/settings-layout";
import { Card, SectionTitle } from "@/components/ui";
import { cn } from "@/lib/ui/cn";
import type { ReactNode } from "react";

type AdvancedCardFrameProps = {
  children: ReactNode;
  className?: string;
  description: ReactNode;
  footer?: ReactNode;
  id: string;
  title: string;
  tone?: "default" | "danger";
};

export function AdvancedCardFrame({
  children,
  className,
  description,
  footer,
  id,
  title,
  tone = "default",
}: Readonly<AdvancedCardFrameProps>) {
  const titleId = `${id}-title`;

  return (
    <Card
      aria-labelledby={titleId}
      className={cn(
        settingsCardFrameClassName,
        "flex flex-col gap-4.5 p-[18px_20px]",
        tone === "danger" && "border-red/55",
        className,
      )}
      data-advanced-card={id}
      data-settings-card=""
      data-settings-card-frame="settled"
      role="region"
      size="lg"
    >
      <div>
        <SectionTitle className={tone === "danger" ? "text-red-text" : undefined} id={titleId}>
          {title}
        </SectionTitle>
        <div className="mt-1 max-w-[600px] text-[12.5px] leading-[1.55] text-fg-muted">
          {description}
        </div>
      </div>
      {children}
      {footer ? (
        <div className="mt-auto flex flex-wrap items-center justify-end gap-2.5 border-border-soft border-t pt-4">
          {footer}
        </div>
      ) : null}
    </Card>
  );
}
