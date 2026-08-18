"use client";

import { displayProvider } from "@/components/onboarding/onboarding-form-utils";
import { Button, Modal, SegmentedControl } from "@/components/ui";
import type { FirstCheckRunPlan } from "@/lib/actions/rank-check-preview";
import { formatEstimateCents } from "@/lib/cost-estimate/project-estimate";
import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import Link from "next/link";
import type { ReactNode } from "react";

export type FirstCheckRunScope = "all" | "first";

export type FirstCheckRunModalProps = {
  projectRef: ProjectRef;
  open: boolean;
  onClose: () => void;
  plan: FirstCheckRunPlan | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  runScope: FirstCheckRunScope;
  onRunScopeChange: (scope: FirstCheckRunScope) => void;
  onConfirm: () => void;
  confirming: boolean;
  confirmError: string | null;
};

const scopeLabels = {
  engine: "Engine",
  location: "Location",
  device: "Device",
  depth: "Depth",
  frequency: "Frequency",
} as const;

function guardNotices(plan: FirstCheckRunPlan, projectRef: ProjectRef) {
  const notices: { content: ReactNode; id: string }[] = [];
  if (!plan.providerReady) {
    notices.push({ content: "Connect a SERP provider before running checks.", id: "provider" });
  }
  if (plan.isSampleProject) {
    notices.push({ content: "Sample projects don't run real checks.", id: "sample" });
  }
  if (plan.budgetExhausted) {
    notices.push({
      content: (
        <>
          Monthly rank-check budget reached.{" "}
          <Link
            className="font-semibold text-accent-text"
            href={`${appPath(projectRef, "settings")}#provider-usage`}
          >
            Raise the budget
          </Link>
        </>
      ),
      id: "budget",
    });
  }
  if (plan.readyCount === 0) {
    notices.push({ content: "No keywords are ready for a first check.", id: "ready" });
  }
  return notices;
}

function FirstCheckRunPlanRows({
  plan,
  runScope,
}: Readonly<{ plan: FirstCheckRunPlan; runScope: FirstCheckRunScope }>) {
  const rows: { label: string; value: string }[] = Object.entries(scopeLabels).map(
    ([key, label]) => ({
      label,
      value: plan.scope[key as keyof FirstCheckRunPlan["scope"]],
    }),
  );
  const checkCount = runScope === "all" ? plan.readyCount : Math.min(1, plan.readyCount);
  if (plan.estimatedCostPerCheckCents != null) {
    rows.push({
      label: "Estimated cost",
      value: `~${formatEstimateCents(checkCount * plan.estimatedCostPerCheckCents)}`,
    });
  }
  rows.push({
    label: "Budget",
    value: `${formatEstimateCents(plan.budget.spentCents)} of ${formatEstimateCents(plan.budget.capCents)}`,
  });

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      {rows.map((row, index) => (
        <div className={index % 2 === 0 ? "bg-bg-sunken" : "bg-bg-elev"} key={row.label}>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="text-[13px] text-fg-muted">{row.label}</span>
            <span className="text-right font-mono text-[13px] font-semibold text-fg">
              {row.value}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function FirstCheckRunPlanBody({
  onRunScopeChange,
  plan,
  projectRef,
  runScope,
}: Readonly<
  Pick<FirstCheckRunModalProps, "onRunScopeChange" | "plan" | "projectRef" | "runScope"> & {
    plan: FirstCheckRunPlan;
  }
>) {
  const notices = guardNotices(plan, projectRef);
  const options = [
    { label: "First keyword", value: "first" },
    {
      disabled: plan.readyCount <= 1,
      label: `All ready (${plan.readyCount})`,
      value: "all",
    },
  ] as const;

  return (
    <div className="grid gap-4.5">
      <p className="m-0 rounded-[10px] border border-border bg-bg px-3.5 py-3 text-[12.5px] leading-5 text-fg-muted">
        This manual run starts checks now, outside the schedule.
      </p>

      <section className="grid gap-2" aria-labelledby="provider-order-heading">
        <h3
          className="m-0 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted"
          id="provider-order-heading"
        >
          Provider fallback order
        </h3>
        <ol className="m-0 grid list-none gap-2 p-0" aria-label="SERP provider fallback order">
          {plan.providers.map((provider, index) => (
            <li
              className="flex items-center gap-3 rounded-[10px] border border-border px-3.5 py-2.5"
              key={provider}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-[10px] font-semibold text-accent-text">
                {index + 1}
              </span>
              <span className="text-[13px] font-semibold text-fg">{displayProvider(provider)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-2" aria-labelledby="check-scope-heading">
        <h3
          className="m-0 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted"
          id="check-scope-heading"
        >
          Check scope
        </h3>
        <FirstCheckRunPlanRows plan={plan} runScope={runScope} />
      </section>

      <SegmentedControl
        label={`Run scope - ${plan.readyCount} keyword${plan.readyCount === 1 ? "" : "s"} ready`}
        labelClassName="font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted"
        name="first-check-run-scope"
        onChange={onRunScopeChange}
        options={options}
        value={runScope}
      />

      {runScope === "all" && plan.readyCount > 1 ? (
        <p className="m-0 text-[12px] leading-5 text-fg-muted">
          The first keyword runs immediately; the remaining {plan.readyCount - 1} join the check
          queue.
        </p>
      ) : null}

      {notices.length > 0 ? (
        <div className="grid gap-1.5" role="alert">
          {notices.map((notice) => (
            <p className="m-0 text-[12px] leading-5 text-red-text" key={notice.id}>
              {notice.content}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function FirstCheckRunModal({
  confirmError,
  confirming,
  error,
  loading,
  onClose,
  onConfirm,
  onRetry,
  onRunScopeChange,
  open,
  plan,
  projectRef,
  runScope,
}: Readonly<FirstCheckRunModalProps>) {
  const blocked =
    !plan ||
    loading ||
    Boolean(error) ||
    !plan.providerReady ||
    plan.isSampleProject ||
    plan.budgetExhausted ||
    plan.readyCount === 0;

  const footer = (
    <div className="flex w-full flex-wrap items-center justify-end gap-2">
      {confirmError ? (
        <p className="m-0 mb-1 w-full text-[12px] leading-5 text-red-text" role="alert">
          {confirmError}
        </p>
      ) : null}
      <Button onClick={onClose} type="button" variant="secondary">
        Cancel
      </Button>
      <Button
        disabled={blocked}
        loading={confirming}
        loadingLabel="Starting..."
        onClick={onConfirm}
        type="button"
      >
        Confirm &amp; run
      </Button>
    </div>
  );

  return (
    <Modal footer={footer} onClose={onClose} open={open} size="md" title="Run first check">
      {loading ? (
        <p className="m-0 text-[13px] text-fg-muted" role="status">
          Loading run details...
        </p>
      ) : null}
      {!loading && error ? (
        <div className="grid gap-3">
          <p className="m-0 text-[13px] text-red-text" role="alert">
            {error}
          </p>
          <Button onClick={onRetry} type="button" variant="secondary">
            Retry
          </Button>
        </div>
      ) : null}
      {!loading && !error && plan ? (
        <FirstCheckRunPlanBody
          onRunScopeChange={onRunScopeChange}
          plan={plan}
          projectRef={projectRef}
          runScope={runScope}
        />
      ) : null}
      {!loading && !error && !plan ? (
        <p className="m-0 text-[13px] text-fg-muted">Run details are unavailable.</p>
      ) : null}
    </Modal>
  );
}
