import { settingsCardFrameClassName } from "@/components/settings/shell/settings-layout";
import { Card, SectionTitle } from "@/components/ui";
import { cn } from "@/lib/ui/cn";
import type { ReactNode } from "react";

type TeamReadOnlyCardProps = {
  children: ReactNode;
  className: string;
  description: string;
  frameId: "pending-invites" | "roles";
  title: string;
};

export function TeamReadOnlyCard({
  children,
  className,
  description,
  frameId,
  title,
}: Readonly<TeamReadOnlyCardProps>) {
  return (
    <Card
      className={cn(settingsCardFrameClassName, className)}
      data-settings-card=""
      data-settings-card-frame="settled"
      data-team-card-frame={frameId}
      size="lg"
    >
      <SectionTitle>{title}</SectionTitle>
      <p className="m-0 mt-1 text-[12.5px] leading-[1.55] text-fg-muted">{description}</p>
      <div className="mt-5">{children}</div>
    </Card>
  );
}
