"use client";

import {
  DismissedProviderNotice,
  ProviderAttentionNotice,
} from "@/components/integrations/provider-recovery/ProviderAttentionNotice";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ProviderLogo } from "@/components/ui/ProviderLogo";
import { StatusChip } from "@/components/ui/StatusChip";
import { CaretRightIcon } from "@phosphor-icons/react/dist/csr/CaretRight";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { useState } from "react";
import { ProviderAttentionChecks } from "./ProviderAttentionChecks";
import { ProviderConnectionSummary } from "./ProviderConnectionSummary";
import { type AttentionState, type AttentionTab, attentionCopy } from "./provider-attention-copy";
import { checksLabel } from "./provider-attention-pages";

export type ProviderAttentionPreviewProps = {
  initialState?: AttentionState;
  initialTab?: AttentionTab;
  canManage?: boolean;
  totalChecks?: number;
  simulateLoadError?: boolean;
  initiallyDismissed?: boolean;
};

export function ProviderAttentionPreview({
  initialState = "billing",
  initialTab = "integration",
  canManage = true,
  totalChecks = 11,
  simulateLoadError = false,
  initiallyDismissed = false,
}: ProviderAttentionPreviewProps) {
  const [state, setState] = useState(initialState);
  const [tab, setTab] = useState<AttentionTab>(initialTab);
  const [dismissedState, setDismissedState] = useState<AttentionState | null>(
    initiallyDismissed ? initialState : null,
  );
  const copy = attentionCopy[state];
  const steps =
    state === "internal"
      ? [
          "Our team investigates the check startup issue.",
          "Earlier requests are reviewed before another attempt.",
          "Monitoring resumes on your saved schedule.",
        ]
      : state === "ready"
        ? [
            "Provider account billing is verified.",
            "Earlier requests have been reviewed.",
            "Your next scheduled check is ready.",
          ]
        : [
            "Verify billing in your provider account.",
            "We review earlier requests and confirm their costs.",
            "Monitoring resumes at the next scheduled time.",
          ];
  async function checkAccount() {
    setState("checking");
    await new Promise((resolve) => setTimeout(resolve, 900));
    setState("review");
  }
  return (
    <main className="min-h-screen bg-bg px-4 py-6 text-fg sm:px-8 sm:py-10">
      <div className="mx-auto max-w-[1000px]">
        <div className="mb-6 flex items-center gap-1.5 text-[12px] text-fg-muted">
          <span>example.com</span>
          <CaretRightIcon aria-hidden size={12} />
          <span>{tab === "checks" ? "Runs" : "Integrations"}</span>
        </div>
        <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="m-0 text-[23px] leading-tight font-semibold tracking-[-0.65px]">
              {tab === "checks" ? "Affected checks" : "Integrations"}
            </h1>
            <p className="mb-0 mt-2 text-[13px] text-fg-muted">
              {tab === "checks"
                ? "Check outcomes and provider usage for this connection."
                : "Manage the data sources used by this project."}
            </p>
          </div>
          {tab === "integration" && state !== "ready" ? (
            <Button onClick={() => setTab("checks")} size="sm" variant="outline">
              {checksLabel(totalChecks)} affected <CaretRightIcon aria-hidden size={13} />
            </Button>
          ) : null}
        </div>
        {tab === "checks" ? (
          <ProviderAttentionChecks
            onBack={() => setTab("integration")}
            simulateLoadError={simulateLoadError}
            state={state}
            totalChecks={totalChecks}
          />
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
            <section className="min-w-0" aria-label="SERP providers">
              <h2 className="mb-3 mt-0 text-[13px] font-semibold">SERP providers</h2>
              <Card className="flex flex-col gap-5 p-3 sm:p-5">
                <div className="flex flex-wrap items-center gap-3 border border-transparent px-3 sm:px-4">
                  <span className="grid w-6 shrink-0 place-items-center">
                    <ProviderLogo
                      alt="DataForSEO"
                      domain="dataforseo.com"
                      fallbackIcon="chart"
                      size="xs"
                      tint="var(--blue)"
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="m-0 text-[15px] font-semibold">DataForSEO</h2>
                      <StatusChip label="Primary" size="sm" />
                    </div>
                    <p className="mb-0 mt-1 text-[12px] text-fg-muted">Your own provider account</p>
                  </div>
                  <StatusChip label={copy.label} size="sm" tone={copy.tone} />
                </div>
                {dismissedState === state ? (
                  <DismissedProviderNotice state={state} onShow={() => setDismissedState(null)} />
                ) : (
                  <ProviderAttentionNotice
                    canManage={canManage}
                    copy={copy}
                    onCheck={() => void checkAccount()}
                    onDismiss={() => setDismissedState(state)}
                    onViewChecks={() => setTab("checks")}
                    state={state}
                  />
                )}
                <ProviderConnectionSummary state={state} totalChecks={totalChecks} />
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-fg-muted">
                  <span>Scope: rank checks using this connection</span>
                  <span>Last checked just now</span>
                </div>
              </Card>
              <Card className="mt-3 p-3 sm:p-5">
                <div className="flex flex-wrap items-center gap-3 border border-transparent px-3 sm:px-4">
                  <span className="grid w-6 shrink-0 place-items-center">
                    <ProviderLogo
                      alt="SerpApi"
                      domain="serpapi.com"
                      fallbackIcon="magnifier"
                      size="xs"
                      tint="var(--green)"
                    />
                  </span>
                  <div className="flex-1">
                    <h3 className="m-0 text-[14px] font-semibold">SerpApi</h3>
                    <p className="mb-0 mt-1 text-[12px] text-fg-muted">Not connected</p>
                  </div>
                  <StatusChip label="Optional" size="sm" />
                </div>
              </Card>
            </section>
            <aside className="flex flex-col gap-5 pt-0 lg:pt-[31px]">
              <div className="rounded-card border border-border p-4">
                <h2 className="m-0 text-[13px] font-semibold">What happens next</h2>
                <ol className="m-0 mt-4 list-none space-y-4 p-0 text-[12px] leading-relaxed">
                  {steps.map((step, index) => (
                    <li className="flex gap-2.5" key={step}>
                      <span className="font-mono text-fg-muted">0{index + 1}</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <p className="m-0 flex items-start gap-2 px-1 text-[12px] leading-relaxed text-fg-muted">
                <CheckCircleIcon aria-hidden className="mt-0.5 shrink-0" size={15} />
                <span>
                  Your schedule is saved. Missed checks will not be backfilled automatically.
                </span>
              </p>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
