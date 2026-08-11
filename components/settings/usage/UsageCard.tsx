import { SettingsCard } from "@/components/settings/shell/SettingsCard";
import type { ReactNode } from "react";

type UsageCardProps = {
  children: ReactNode;
  className?: string;
  description: string;
  id?: string;
  title: string;
};

export function UsageCard({
  children,
  className,
  description,
  id,
  title,
}: Readonly<UsageCardProps>) {
  return (
    <section id={id}>
      <SettingsCard className={className} description={description} showSave={false} title={title}>
        {children}
      </SettingsCard>
    </section>
  );
}
