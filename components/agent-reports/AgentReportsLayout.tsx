"use client";

import { PageContent } from "@/components/shell/PageContent";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { ReactNode } from "react";
import { useAgentWorkspaceAccess } from "./AgentWorkspaceAccessProvider";

export function AgentReportsLayout({
  children,
  busy = false,
}: Readonly<{ children: ReactNode; busy?: boolean }>) {
  return (
    <PageContent aria-busy={busy || undefined} className="flex flex-col gap-5">
      {children}
    </PageContent>
  );
}

export function AgentReportsToolbar({
  description,
  action,
}: Readonly<{ description: string; action?: ReactNode }>) {
  return (
    <div className="grid gap-3">
      <p className="text-[13px] text-fg-muted">{description}</p>
      {action ? <div>{action}</div> : null}
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
                variant="secondary"
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
            className="flex min-w-0 flex-wrap items-center justify-between gap-3 px-4 py-4"
            key={key}
          >
            <div className="min-w-0 flex-1">
              <div className="h-[1lh] w-3/4 rounded-control bg-bg-sunken text-[14px] motion-safe:animate-pulse" />
              <div className="mt-1 h-[1lh] w-1/4 rounded-control bg-bg-sunken text-[11px] motion-safe:animate-pulse" />
            </div>
            <div className="h-[1lh] w-20 rounded-control bg-bg-sunken text-[12px] motion-safe:animate-pulse" />
          </div>
        ))}
      </Card>
    </AgentReportsLayout>
  );
}
