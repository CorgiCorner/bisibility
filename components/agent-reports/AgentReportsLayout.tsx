"use client";

import { PageContent } from "@/components/shell/PageContent";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import type { ReactNode } from "react";
import { useAgentWorkspaceAccess } from "./AgentWorkspaceAccessProvider";

export function AgentReportsLayout({
  children,
  busy = false,
}: Readonly<{ children: ReactNode; busy?: boolean }>) {
  return (
    <PageContent variant="section" aria-busy={busy || undefined} className="flex flex-col gap-4">
      {children}
    </PageContent>
  );
}

export function AgentReportsToolbar({
  description,
  action,
  filter,
}: Readonly<{ description: string; action?: ReactNode; filter?: ReactNode }>) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="m-0 min-w-0 max-w-2xl text-ui-body text-fg-muted">{description}</p>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        {filter}
        {action ? <div className="ml-auto flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
    </div>
  );
}

export function AgentReportsLoading({
  description,
  addReportLabel,
}: Readonly<{ description: string; addReportLabel: string }>) {
  const { canCreate } = useAgentWorkspaceAccess();
  return (
    <AgentReportsLayout busy>
      <div aria-hidden>
        <AgentReportsToolbar
          description={description}
          action={
            canCreate ? (
              <Button
                disabled
                tabIndex={-1}
                size="sm"
                startIcon={<PlusIcon aria-hidden size={15} weight="regular" />}
                className="text-transparent bg-bg-sunken motion-safe:animate-pulse"
              >
                {addReportLabel}
              </Button>
            ) : undefined
          }
        />
      </div>
      <Card aria-hidden className="divide-y divide-border p-0">
        {["first", "second", "third"].map((key) => (
          <div
            className="flex min-w-0 flex-wrap items-center justify-between gap-3 px-4 py-3"
            key={key}
          >
            <div className="min-w-0 flex-1">
              <div className="h-[1lh] w-3/4 rounded-control bg-bg-sunken text-[13px] motion-safe:animate-pulse" />
              <div className="mt-1 h-[1lh] w-1/4 rounded-control bg-bg-sunken text-[11px] motion-safe:animate-pulse" />
            </div>
            <div className="h-[1lh] w-20 rounded-control bg-bg-sunken text-[12px] motion-safe:animate-pulse" />
          </div>
        ))}
      </Card>
    </AgentReportsLayout>
  );
}
