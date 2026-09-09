import { PageContent } from "@/components/shell/PageContent";
import { BackLink } from "@/components/ui/BackLink";
import type { ReactNode } from "react";

type ScheduleObjectFrameProps = {
  bodyLabel: string;
  breadcrumb: { href: string; label: ReactNode };
  children?: ReactNode;
  navigation?: ReactNode;
  subtitle?: ReactNode;
  title: string;
};

export function ScheduleObjectFrame({
  bodyLabel,
  breadcrumb,
  children,
  navigation,
  subtitle,
  title,
}: Readonly<ScheduleObjectFrameProps>) {
  return (
    <PageContent className="grid gap-4">
      {navigation}
      <nav aria-label="Breadcrumb" className="w-fit text-[12.5px] text-fg-muted">
        <BackLink href={breadcrumb.href}>{breadcrumb.label}</BackLink>
      </nav>
      <header>
        <h1 className="m-0 text-[21px] font-semibold tracking-[-0.4px] text-fg">{title}</h1>
        {subtitle ? <p className="m-0 mt-1 text-[12.5px] text-fg-muted">{subtitle}</p> : null}
      </header>
      <section aria-label={bodyLabel} className="min-w-0">
        {children}
      </section>
    </PageContent>
  );
}
