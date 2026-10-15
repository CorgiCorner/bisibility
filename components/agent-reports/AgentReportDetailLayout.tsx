import { PageContent } from "@/components/shell/PageContent";
import { Card } from "@/components/ui/Card";
import Link from "next/link";
import type { ReactNode } from "react";

export function AgentReportDetailFrame({
  children,
  busy = false,
}: Readonly<{ children: ReactNode; busy?: boolean }>) {
  return (
    <PageContent variant="section" className="grid gap-4" aria-busy={busy || undefined}>
      {children}
    </PageContent>
  );
}

export function AgentReportBack({ label, href }: Readonly<{ label: string; href?: string }>) {
  const className = "text-[13px] font-semibold text-accent-text hover:underline";
  return href ? (
    <Link href={href} className={className}>
      {label}
    </Link>
  ) : (
    <span aria-hidden className={className}>
      <span className="rounded-control bg-border text-transparent motion-safe:animate-pulse">
        {label}
      </span>
    </span>
  );
}

export function AgentReportHeader({
  title,
  kind,
  share,
  loading = false,
}: Readonly<{ title: ReactNode; kind: ReactNode; share: ReactNode; loading?: boolean }>) {
  return (
    <Card
      className="flex min-w-0 flex-wrap items-start justify-between gap-3"
      aria-hidden={loading || undefined}
    >
      <div className="min-w-0 flex-1 basis-64">
        <h1 className="m-0 break-words text-[18px] font-semibold leading-snug">{title}</h1>
        <p className="mb-0 mt-1 text-[12px] text-fg-muted">{kind}</p>
      </div>
      {share}
    </Card>
  );
}
