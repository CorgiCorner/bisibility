import { settingsCardFrameClassName } from "@/components/settings/shell/settings-layout";
import { Card, SectionTitle } from "@/components/ui";
import { cn } from "@/lib/ui/cn";
import type { ReactNode } from "react";

type DeveloperCardFrameProps = {
  children: ReactNode;
  className: string;
  description: ReactNode;
  footer?: ReactNode;
  id: string;
  title: string;
};

export function DeveloperCardFrame({
  children,
  className,
  description,
  footer,
  id,
  title,
}: Readonly<DeveloperCardFrameProps>) {
  const titleId = `${id}-title`;

  return (
    <Card
      aria-labelledby={titleId}
      className={cn(settingsCardFrameClassName, "flex flex-col gap-4.5 p-[18px_20px]", className)}
      data-developer-card={id}
      data-settings-card=""
      data-settings-card-frame="settled"
      role="region"
      size="lg"
    >
      <div>
        <SectionTitle id={titleId}>{title}</SectionTitle>
        <div className="mt-1 max-w-[520px] text-[12.5px] leading-[1.55] text-fg-muted">
          {description}
        </div>
      </div>
      {children}
      {footer ? <div className="mt-auto flex flex-wrap justify-end gap-2.5">{footer}</div> : null}
    </Card>
  );
}
