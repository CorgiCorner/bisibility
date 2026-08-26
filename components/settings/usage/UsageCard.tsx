import { SettingsCard } from "@/components/settings/shell/SettingsCard";
import type { ReactNode } from "react";

type UsageCardProps = {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  description: string;
  id?: string;
  title: string;
};

export function UsageCard({
  action,
  children,
  className,
  description,
  id,
  title,
}: Readonly<UsageCardProps>) {
  return (
    <section id={id}>
      <SettingsCard
        action={action}
        className={className}
        description={description}
        showSave={false}
        title={title}
      >
        {children}
      </SettingsCard>
    </section>
  );
}
